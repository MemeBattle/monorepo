import type { Clock } from '../core/ports/clock'
import type { DatabaseProbe } from '../core/ports/database-probe'
import type { Logger } from '../core/ports/logger'

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
