import { serve } from '@hono/node-server'

import { createConsoleLogger } from '../adapters/console-logger'
import { createNodeDatabases } from '../adapters/pg/database'
import { createPgGamesRepository } from '../adapters/pg/games-repository'
import { createPgDatabaseProbe } from '../adapters/pg/probe'
import { systemClock } from '../adapters/system-clock'
import { loadDatabaseConfig, loadHttpConfig, loadInternalApiConfig, loadLoggingConfig } from '../core/config'
import { createInternalApp } from '../http/internal-app'
import { createPublicApp } from '../http/public-app'
import { loadDevelopmentEnv } from './env'

// In development this package's and the monorepo's root `.env*` files supply what the shell does not; production
// sets the environment.
loadDevelopmentEnv()

// Only the sections this entry uses; it moves to `loadConfig` once auth is wired in. A ConfigError escapes on
// purpose: a bad environment stops the process with every offending variable named.
const http = loadHttpConfig(process.env)
const logging = loadLoggingConfig(process.env)
const database = loadDatabaseConfig(process.env)
const internalApi = loadInternalApiConfig(process.env)

const logger = createConsoleLogger({ level: logging.level })
// Both pools for the process, sized as the previous service ran them (docs/adrs/session-store-locking.md);
// `databases.locks` is the session store's and opens nothing until the auth routes are wired in (#837). A pool error
// is logged and survived: the broken client is already gone and `/health` reports the database until it is back.
const databases = createNodeDatabases(database, {
  onError: (error, handle) => {
    logger.error('database_pool_error', { handle, error: error instanceof Error ? error.message : String(error) })
  },
  main: { max: 5 },
  locks: { max: 10 },
})
const deps = { logger, clock: systemClock, database: createPgDatabaseProbe(databases.main) }
const publicApp = createPublicApp({ ...deps, corsOrigins: http.corsOrigins })
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
