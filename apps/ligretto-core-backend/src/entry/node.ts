import { serve } from '@hono/node-server'

import { createConsoleLogger } from '../adapters/console-logger'
import { createNodeDatabases } from '../adapters/pg/database'
import { createPgGamesRepository } from '../adapters/pg/games-repository'
import { createPgDatabaseProbe } from '../adapters/pg/probe'
import { createPgUsersRepository } from '../adapters/pg/users-repository'
import { systemClock } from '../adapters/system-clock'
import { loadConfig } from '../core/config'
import { createInternalApp } from '../http/internal-app'
import { createPublicApp } from '../http/public-app'
import { createAuth } from './auth'
import { loadDevelopmentEnv } from './env'

// In development this package's and the monorepo's root `.env*` files supply what the shell does not; production
// sets the environment.
loadDevelopmentEnv()

// A ConfigError escapes on purpose: a bad environment stops the process with every offending variable named.
const { http, logging, database, internalApi, auth } = loadConfig(process.env)

const logger = createConsoleLogger({ level: logging.level })
// Both pools for the process, sized as the previous service ran them (docs/adrs/session-store-locking.md);
// `databases.locks` holds the session store's lock transactions. A pool error is logged and survived: the broken
// client is already gone and `/health` reports the database until it is back.
const databases = createNodeDatabases(database, {
  onError: (error, handle) => {
    logger.error('database_pool_error', { handle, error: error instanceof Error ? error.message : String(error) })
  },
  main: { max: 5 },
  locks: { max: 10 },
})
const deps = { logger, clock: systemClock, database: createPgDatabaseProbe(databases.main) }
const { handlers, verifyAccessToken } = createAuth({ config: auth, databases, clock: systemClock })
const publicApp = createPublicApp({
  ...deps,
  corsOrigins: http.corsOrigins,
  auth: handlers,
  users: createPgUsersRepository(databases.main),
  verifyAccessToken,
})
const internalApp = createInternalApp({ ...deps, games: createPgGamesRepository(databases.main), internalTokens: internalApi.tokens })

/** One port for both apps: `/internal` and below is the internal app, everything else the public one. */
const dispatch = (request: Request): Response | Promise<Response> => {
  const { pathname } = new URL(request.url)
  const internal = pathname === '/internal' || pathname.startsWith('/internal/')
  return internal ? internalApp.fetch(request) : publicApp.fetch(request)
}

serve({ fetch: dispatch, port: http.port }, () => {
  logger.info('listening', { port: http.port })
})
