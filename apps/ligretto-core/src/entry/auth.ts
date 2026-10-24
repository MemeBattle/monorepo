import { createAuthHandlers, createCasClient, createDiscoveryCache, verifyAccessToken } from '@memebattle/ligretto-auth'
import type { AccessTokenClaims, AuthHandlers } from '@memebattle/ligretto-auth'

import type { DatabaseHandles } from '../adapters/pg/database'
import { createPgSessionStore } from '../adapters/pg/session-store'
import type { AuthConfig } from '../core/config'
import type { Clock } from '../core/ports/clock'

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
}: {
  config: AuthConfig
  databases: DatabaseHandles
  clock: Clock
  fetch?: typeof globalThis.fetch
}): AuthComposition => {
  const cache = createDiscoveryCache()
  const client = createCasClient({
    issuer: config.casIssuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    postLogoutRedirectUri: config.postLogoutRedirectUri,
    requestTimeoutMs: CAS_REQUEST_TIMEOUT_MS,
    cache,
    fetch,
  })
  const store = createPgSessionStore(databases, { clock })
  const handlers = createAuthHandlers({ client, store, transport: config.sessionTransport, appUrl: config.appUrl, now: () => clock.now() })
  return {
    handlers,
    verifyAccessToken: token => verifyAccessToken(token, { issuer: config.casIssuer, audience: ACCESS_TOKEN_AUDIENCE, cache, fetch }),
  }
}
