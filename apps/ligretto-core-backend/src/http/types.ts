import type { AccessTokenClaims, AuthHandlers } from '@memebattle/ligretto-auth'

import type { Clock } from '../core/ports/clock'
import type { DatabaseProbe } from '../core/ports/database-probe'
import type { GamesRepository } from '../core/ports/games-repository'
import type { Logger } from '../core/ports/logger'
import type { UsersRepository } from '../core/ports/users-repository'

/** What the middleware puts on the context for everything after it. */
export type AppEnv = {
  Variables: {
    requestId: string
    /** The request's logger, with the request id bound. */
    logger: Logger
  }
}

/** The ports both apps are built from; an entry composes the adapters, a test the fakes. */
export interface AppDeps {
  logger: Logger
  clock: Clock
  database: DatabaseProbe
  /** The origins the public app allows credentialed CORS requests from; the internal app ignores it. */
  corsOrigins?: string[]
}

/** What the internal app needs besides the shared ports. */
export interface InternalAppDeps extends AppDeps {
  games: GamesRepository
  /** The accepted values of `LIGRETTO_INTERNAL_API_TOKEN`: one, or two while it is rotated. */
  internalTokens: readonly string[]
}

/** What the public app needs besides the shared ports. */
export interface PublicAppDeps extends AppDeps {
  /** The four handlers of `@memebattle/ligretto-auth`, composed by the entry over its session store and CAS client. */
  auth: AuthHandlers
  users: UsersRepository
  /**
   * Verifies a CAS access token for this service. A function rather than a call inside `src/http`, so the issuer,
   * the audience, the metadata cache and `fetch` stay in the composition. Throws `InvalidTokenError` for a refused
   * token and `DiscoveryError` when CAS's metadata cannot be read.
   */
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims>
}
