/**
 * The provider's metadata: the discovery document and the JWKS, cached for as long as their `Cache-Control` says.
 *
 * No path is hard-coded. The discovery document is fetched by appending `/.well-known/openid-configuration` to the
 * configured issuer — CAS advertises every endpoint as `{issuer}/<path>` and forbids a trailing slash, so an issuer
 * that carries a path keeps it — and the JWKS at the `jwks_uri` the document advertises
 * ([INTEGRATION.md §2–3](../../../apps/cas/docs/INTEGRATION.md), ADR 0017). Before a document is trusted its own
 * `issuer` must equal the configured one byte for byte (ADR 0009 (e)).
 */

import type { Client, Result } from './client'
import { atUrl } from './client'
import { DiscoveryError } from './errors'
import type { Discovery } from './generated/models/Discovery'
import type { Jwks } from './generated/models/Jwks'
import { discovery as discoveryOperation } from './generated/operations/discovery'
import { jwks as jwksOperation } from './generated/operations/jwks'

const discoveryUrlOf = (issuer: string): string => `${issuer}/.well-known/openid-configuration`

/** jose's own `createRemoteJWKSet` waits as long before asking for the keys again, and for the same reason. */
const JWKS_REFETCH_COOLDOWN_MS = 30_000

/**
 * The fields a verification reads: where to fetch the keys, and which algorithms the provider signs with. A document
 * that parsed but is missing one is not a provider description — caching it would answer every verification until it
 * expires with a failure of a kind this package's contract does not name.
 */
const describesTheProvider = (document: Discovery): boolean =>
  typeof document.jwks_uri === 'string' &&
  document.jwks_uri !== '' &&
  Array.isArray(document.id_token_signing_alg_values_supported) &&
  document.id_token_signing_alg_values_supported.every(alg => typeof alg === 'string')

/** A key set is usable when `keys` is there and holds JSON objects: every verification searches it by `kid`. */
const holdsKeys = (set: Jwks): boolean => Array.isArray(set.keys) && set.keys.every(key => typeof key === 'object' && key !== null)

/** The `max-age` of a response, in seconds, when it has a usable one. CAS sends `public, max-age=3600`. */
const maxAgeOf = (headers: Headers): number | undefined => {
  const cacheControl = headers.get('cache-control')
  if (cacheControl === null) {
    return undefined
  }
  const matched = /(?:^|,)\s*max-age\s*=\s*"?(\d+)"?/i.exec(cacheControl)
  if (matched === null) {
    return undefined
  }
  const seconds = Number(matched[1])
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined
}

interface Entry<Value> {
  value: Value
  expiresAt: number
}

/** The metadata of the providers this process talks to, each kept for as long as its own response allows. */
export interface DiscoveryCache {
  /** The discovery document of `issuer`, from the cache or from the provider. */
  discovery(issuer: string, client: Client): Promise<Discovery>
  /** The keys of `issuer`, from the cache or from `jwksUri` — the `jwks_uri` its document advertises. */
  jwks(issuer: string, jwksUri: string, client: Client): Promise<Jwks>
  /**
   * The keys read from the provider again, for a `kid` the cached set does not have. What is cached is replaced only
   * once a usable answer has arrived: a token is reason to go looking for a new key, never reason to drop the keys a
   * session in progress verifies against while the provider is away. A second ask inside the cooldown answers from
   * the cache instead, so a flood of unknown `kid`s is not a flood of requests to the provider.
   */
  refetchJwks(issuer: string, jwksUri: string, client: Client): Promise<Jwks>
}

export interface DiscoveryCacheOptions {
  /** The clock expiry is read against. Tests drive it instead of waiting out a `max-age`. */
  now?: () => number
}

/**
 * A cache of public provider metadata. Nothing in it belongs to a user or a session, so a process may share one and
 * a replacement process simply refetches.
 */
export const createDiscoveryCache = ({ now = Date.now }: DiscoveryCacheOptions = {}): DiscoveryCache => {
  const documents = new Map<string, Entry<Discovery>>()
  const keySets = new Map<string, Entry<Jwks>>()
  /** When the keys of an issuer were last asked for out of turn, which is what the cooldown is read against. */
  const refetchedAt = new Map<string, number>()

  const cached = <Value>(entries: Map<string, Entry<Value>>, issuer: string): Value | undefined => {
    const entry = entries.get(issuer)
    if (entry === undefined) {
      return undefined
    }
    if (entry.expiresAt <= now()) {
      entries.delete(issuer)
      return undefined
    }
    return entry.value
  }

  // A response without a usable `max-age` is not cached at all: the next verification refetches rather than guess
  // how long a proxy that stripped the header meant the answer to live. An answer that replaces an entry drops it in
  // that case, so what is cached is always the latest answer and never one an uncacheable answer has superseded.
  const store = <Value>(entries: Map<string, Entry<Value>>, issuer: string, value: Value, maxAge: number | undefined): void => {
    if (maxAge === undefined) {
      entries.delete(issuer)
      return
    }
    entries.set(issuer, { value, expiresAt: now() + maxAge * 1000 })
  }

  const fetched = async <Data>(what: string, send: () => Promise<Result<Data, string>>): Promise<{ data: Data; headers: Headers }> => {
    let result: Result<Data, string>
    try {
      result = await send()
    } catch (cause) {
      throw new DiscoveryError('discovery_unavailable', `${what} could not be fetched`, { cause })
    }
    if (!result.ok) {
      throw new DiscoveryError('discovery_unavailable', `${what} answered ${result.error.status} (${result.error.code})`)
    }
    return { data: result.data, headers: result.headers }
  }

  const discovery = async (issuer: string, client: Client): Promise<Discovery> => {
    const known = cached(documents, issuer)
    if (known !== undefined) {
      return known
    }
    const url = discoveryUrlOf(issuer)
    const { data, headers } = await fetched(`The discovery document at ${url}`, () => discoveryOperation({ client: atUrl(client, url) }))
    if (data.issuer !== issuer) {
      throw new DiscoveryError(
        'issuer_mismatch',
        `The document at ${url} names the issuer ${JSON.stringify(data.issuer)}, not ${JSON.stringify(issuer)}`,
      )
    }
    if (!describesTheProvider(data)) {
      throw new DiscoveryError('malformed_metadata', `The document at ${url} does not advertise both a \`jwks_uri\` and the algorithms it signs with`)
    }
    store(documents, issuer, data, maxAgeOf(headers))
    return data
  }

  const fetchJwks = async (issuer: string, jwksUri: string, client: Client): Promise<Jwks> => {
    const { data, headers } = await fetched(`The JWKS at ${jwksUri}`, () => jwksOperation({ client: atUrl(client, jwksUri) }))
    if (!holdsKeys(data)) {
      throw new DiscoveryError('malformed_metadata', `The JWKS at ${jwksUri} carries no \`keys\` array of JSON Web Keys`)
    }
    store(keySets, issuer, data, maxAgeOf(headers))
    return data
  }

  const jwks = async (issuer: string, jwksUri: string, client: Client): Promise<Jwks> => {
    const known = cached(keySets, issuer)
    return known ?? (await fetchJwks(issuer, jwksUri, client))
  }

  const refetchJwks = async (issuer: string, jwksUri: string, client: Client): Promise<Jwks> => {
    const asked = refetchedAt.get(issuer)
    if (asked !== undefined && asked + JWKS_REFETCH_COOLDOWN_MS > now()) {
      const known = cached(keySets, issuer)
      if (known !== undefined) {
        return known
      }
    }
    // Stamped before the request, so a provider that cannot answer is not asked again on the next token either.
    refetchedAt.set(issuer, now())
    return await fetchJwks(issuer, jwksUri, client)
  }

  return { discovery, jwks, refetchJwks }
}
