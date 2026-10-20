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
  /** Drop the cached JWKS, so the next read refetches it: what an unknown `kid` deserves, once. */
  forgetJwks(issuer: string): void
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
  // how long a proxy that stripped the header meant the answer to live.
  const keep = <Value>(entries: Map<string, Entry<Value>>, issuer: string, value: Value, maxAge: number | undefined): void => {
    if (maxAge !== undefined) {
      entries.set(issuer, { value, expiresAt: now() + maxAge * 1000 })
    }
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
    keep(documents, issuer, data, maxAgeOf(headers))
    return data
  }

  const jwks = async (issuer: string, jwksUri: string, client: Client): Promise<Jwks> => {
    const known = cached(keySets, issuer)
    if (known !== undefined) {
      return known
    }
    const { data, headers } = await fetched(`The JWKS at ${jwksUri}`, () => jwksOperation({ client: atUrl(client, jwksUri) }))
    keep(keySets, issuer, data, maxAgeOf(headers))
    return data
  }

  const forgetJwks = (issuer: string): void => {
    keySets.delete(issuer)
  }

  return { discovery, jwks, forgetJwks }
}
