import { createAuthHandlers, createCasClient, createDiscoveryCache, verifyAccessToken } from '@memebattle/ligretto-auth'
import type { AccessTokenClaims, AuthHandlers } from '@memebattle/ligretto-auth'

import type { DatabaseHandles } from '../adapters/pg/database.ts'
import { createPgSessionStore } from '../adapters/pg/session-store.ts'
import type { AuthConfig } from '../core/config.ts'
import type { Clock } from '../core/ports/clock.ts'

/**
 * The audience CAS mints this service's access tokens for: ligretto is registered with `--audience ligretto`
 * (apps/cas/scripts/seed-dev.sh, CAS ADR 0011). A constant: no deployment registers another one.
 */
export const ACCESS_TOKEN_AUDIENCE = 'ligretto'

/**
 * The bound on every request to CAS. Below the session store's ten-second `lock_timeout`, so a request waiting on a
 * session's lock outlasts one holder stalled on CAS (docs/adrs/session-store-locking.md).
 */
export const CAS_REQUEST_TIMEOUT_MS = 5_000

/**
 * `fetch` bounded by `timeoutMs`, for the access-token verifier: `verifyAccessToken` builds its own transport without a
 * timeout, so the bound goes on the `fetch` it is given. The deadline is the request's signal, joined to any signal the
 * caller passed, so it aborts a stalled body read as well as a stalled connection. The abort rejects inside the
 * package's transport, which fails it as `unreachable`, and the metadata cache reports that as a `DiscoveryError`: the
 * access-token middleware's `503 cas_unavailable`, not a 500.
 */
const boundedFetch =
  (fetch: typeof globalThis.fetch | undefined, timeoutMs: number): typeof globalThis.fetch =>
  async (input, init) => {
    const deadline = AbortSignal.timeout(timeoutMs)
    const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline
    const send = fetch ?? globalThis.fetch
    return await send(input, { ...init, signal })
  }

export interface AuthComposition {
  handlers: AuthHandlers
  /** `verifyAccessToken` with this service's issuer and audience, over the shared metadata cache. */
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims>
}

/**
 * The auth side of the public app, shared by the Node and Worker entries (web standards only, since the Worker program
 * compiles it): the CAS client and the access-token verifier read through one metadata cache, and the handlers run
 * over the Postgres session store on the two handles.
 */
export const createAuth = ({
  config,
  databases,
  clock,
  fetch,
  casRequestTimeoutMs = CAS_REQUEST_TIMEOUT_MS,
}: {
  config: AuthConfig
  databases: DatabaseHandles
  clock: Clock
  fetch?: typeof globalThis.fetch
  /** `CAS_REQUEST_TIMEOUT_MS` unless a test needs a shorter bound. */
  casRequestTimeoutMs?: number
}): AuthComposition => {
  const cache = createDiscoveryCache()
  const client = createCasClient({
    issuer: config.casIssuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    postLogoutRedirectUri: config.postLogoutRedirectUri,
    requestTimeoutMs: casRequestTimeoutMs,
    cache,
    fetch,
  })
  const store = createPgSessionStore(databases, { clock })
  const verifierFetch = boundedFetch(fetch, casRequestTimeoutMs)
  const handlers = createAuthHandlers({ client, store, transport: config.sessionTransport, appUrl: config.appUrl, now: () => clock.now() })
  return {
    handlers,
    verifyAccessToken: token => verifyAccessToken(token, { issuer: config.casIssuer, audience: ACCESS_TOKEN_AUDIENCE, cache, fetch: verifierFetch }),
  }
}
