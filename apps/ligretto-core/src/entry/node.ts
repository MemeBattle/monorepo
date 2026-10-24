import { fileURLToPath } from 'node:url'

import dotenv from '@codexsoft/dotenv-flow'
import { serve } from '@hono/node-server'

import { createConsoleLogger } from '../adapters/console-logger'
import { stubDatabaseProbe } from '../adapters/stub-database-probe'
import { systemClock } from '../adapters/system-clock'
import { loadHttpConfig, loadLoggingConfig } from '../core/config'
import { createInternalApp } from '../http/internal-app'
import { createPublicApp } from '../http/public-app'

// In development the monorepo's root `.env*` files supply what the shell does not; production sets the environment.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ default_node_env: 'development', path: fileURLToPath(new URL('../../../../', import.meta.url)), silent: true })
}

// Only the sections this entry uses; it moves to `loadConfig` once the database and auth are wired in. A ConfigError
// escapes on purpose: a bad environment stops the process with every offending variable named.
const http = loadHttpConfig(process.env)
const logging = loadLoggingConfig(process.env)

const logger = createConsoleLogger({ level: logging.level })
const deps = { logger, clock: systemClock, database: stubDatabaseProbe }
const publicApp = createPublicApp({ ...deps, corsOrigins: http.corsOrigins })
const internalApp = createInternalApp(deps)

/** One port for both apps: `/internal` and below is the internal app, everything else the public one. */
const dispatch = (request: Request): Response | Promise<Response> => {
  const { pathname } = new URL(request.url)
  const internal = pathname === '/internal' || pathname.startsWith('/internal/')
  return internal ? internalApp.fetch(request) : publicApp.fetch(request)
}

serve({ fetch: dispatch, port: http.port }, () => {
  logger.info('listening', { port: http.port })
})
