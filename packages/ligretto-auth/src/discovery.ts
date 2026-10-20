/**
 * The provider's metadata: the discovery document and the JWKS, cached for as long as their `Cache-Control` says.
 *
 * No path is hard-coded. The discovery document is fetched by appending `/.well-known/openid-configuration` to the
 * configured issuer — CAS advertises every endpoint as `{issuer}/<path>` and forbids a trailing slash, so an issuer
 * that carries a path keeps it — and the JWKS at the `jwks_uri` the document advertises
 * ([INTEGRATION.md §2–3](../../../apps/cas/docs/INTEGRATION.md), ADR 0017). Before a document is trusted its own
 * `issuer` must equal the configured one byte for byte (ADR 0009 (e)).
 */

import { importJWK } from 'jose'
import type { Client, Result } from './client'
import { atUrl } from './client'
import { DiscoveryError } from './errors'
import type { Discovery } from './generated/models/Discovery'
import type { Jwks } from './generated/models/Jwks'
import { discovery as discoveryOperation } from './generated/operations/discovery'
import { jwks as jwksOperation } from './generated/operations/jwks'

const discoveryUrlOf = (issuer: string): string => `${issuer}/.well-known/openid-configuration`

/** The cooldown jose's own `createRemoteJWKSet` keeps between two asks for the keys. */
const JWKS_REFETCH_COOLDOWN_MS = 30_000

/**
 * A body that could be metadata at all: a JSON object. A provider or a proxy can answer `null`, a scalar, an array or
 * no body at all, and `null` parses as JSON like any other body. Nothing is read out of a body before this check: a
 * field read off one of those answers would leave this module with an uncoded `TypeError` where its callers handle a
 * `DiscoveryError`.
 */
const isJsonObject = (body: unknown): body is Record<string, unknown> => typeof body === 'object' && body !== null && !Array.isArray(body)

/**
 * The fields a verification reads: where to fetch the keys, and which algorithms the provider signs with. A document
 * missing one is not a provider description; caching it would fail every verification until it expires, with a
 * failure this package's contract does not name.
 */
const describesTheProvider = (document: unknown): document is Discovery =>
  isJsonObject(document) &&
  typeof document.jwks_uri === 'string' &&
  document.jwks_uri !== '' &&
  Array.isArray(document.id_token_signing_alg_values_supported) &&
  document.id_token_signing_alg_values_supported.every(alg => typeof alg === 'string')

/** A published key as this package uses it: found by its `kid`, imported for the `alg` it names. CAS requires both. */
const describesAKey = (key: unknown): boolean => isJsonObject(key) && typeof key.kid === 'string' && typeof key.alg === 'string'

/** A key set is usable when `keys` is there and holds keys: every verification searches it by `kid`. */
const holdsKeys = (set: unknown): set is Jwks => isJsonObject(set) && Array.isArray(set.keys) && set.keys.every(describesAKey)

/**
 * The `kid`s of the keys WebCrypto will not take for the algorithm they name. A set is asked this before it is
 * cached: key material no verification can run on must not be what every token is judged against until the `max-age`
 * runs out, long after the provider has published the repaired key. One such key refuses the whole set rather than
 * being dropped from it, so a token naming that key is not refused as if the provider had never published it.
 */
const unusableKids = async (set: Jwks): Promise<string[]> => {
  const checked = await Promise.all(
    set.keys.map(async key => {
      try {
        await importJWK(key, key.alg)
        return undefined
      } catch {
        return key.kid
      }
    }),
  )
  return checked.filter((kid): kid is string => kid !== undefined)
}

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
   * once a usable answer has arrived: an unknown `kid` is reason to ask for new keys, not reason to drop the keys an
   * open session verifies against while the provider is away. A second ask inside the cooldown answers from the
   * cache, so many unknown `kid`s cost the provider one request.
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
  /** When the keys of an issuer were last refetched; the cooldown is measured from it. */
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
    // The shape first: what is not a provider description has no `issuer` to compare.
    if (!describesTheProvider(data)) {
      throw new DiscoveryError('malformed_metadata', `The document at ${url} does not advertise both a \`jwks_uri\` and the algorithms it signs with`)
    }
    if (data.issuer !== issuer) {
      throw new DiscoveryError(
        'issuer_mismatch',
        `The document at ${url} names the issuer ${JSON.stringify(data.issuer)}, not ${JSON.stringify(issuer)}`,
      )
    }
    store(documents, issuer, data, maxAgeOf(headers))
    return data
  }

  const fetchJwks = async (issuer: string, jwksUri: string, client: Client): Promise<Jwks> => {
    const { data, headers } = await fetched(`The JWKS at ${jwksUri}`, () => jwksOperation({ client: atUrl(client, jwksUri) }))
    if (!holdsKeys(data)) {
      throw new DiscoveryError('malformed_metadata', `The JWKS at ${jwksUri} carries no \`keys\` array of JSON Web Keys`)
    }
    const unusable = await unusableKids(data)
    if (unusable.length > 0) {
      throw new DiscoveryError(
        'unusable_key',
        `The JWKS at ${jwksUri} publishes key material no verification can run on: ${unusable.map(kid => JSON.stringify(kid)).join(', ')}`,
      )
    }
    // Only an answer that passed both checks replaces what is cached: an unusable set neither poisons the cache nor
    // costs an open session the keys it verifies against.
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
