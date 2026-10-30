// Runs the scheduled sweep once against DATABASE_URL (docs/adrs/session-store-locking.md) and exits: expired
// authorization requests, sessions past the cookie grace (each under its lock) and orphaned lock rows. In development
// it runs through `tsx --conditions=development` (`pnpm sweep`), which resolves `@memebattle/ligretto-auth` from
// source; in the image it is compiled JS (`node build/src/entry/sweep.js`) over that package's build.
import { SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'

import { createConsoleLogger } from '../adapters/console-logger.ts'
import { createPgAuthSweepStore } from '../adapters/pg/auth-sweep-store.ts'
import { createNodeDatabases } from '../adapters/pg/database.ts'
import { systemClock } from '../adapters/system-clock.ts'
import { loadDatabaseConfig, loadLoggingConfig } from '../core/config.ts'
import { createSweepExpiredAuth } from '../core/sweep.ts'
import { loadDevelopmentEnv } from './env.ts'
import { runSweep } from './run-sweep.ts'

loadDevelopmentEnv()

// The database and logging sections only; a ConfigError escapes and names every offending variable.
const database = loadDatabaseConfig(process.env)
const logging = loadLoggingConfig(process.env)
const logger = createConsoleLogger({ level: logging.level })

// One candidate at a time: a statement on `main` beside the one lock transaction on `locks`.
const databases = createNodeDatabases(database, {
  onError: (error, handle) => {
    logger.error('database_pool_error', { handle, error: error instanceof Error ? error.message : String(error) })
  },
  main: { max: 2 },
  locks: { max: 1 },
})

const sweep = createSweepExpiredAuth({
  store: createPgAuthSweepStore(databases),
  clock: systemClock,
  logger,
  sessionRetentionMs: SESSION_COOKIE_GRACE_MS,
})

try {
  await runSweep({ sweep, logger })
} catch {
  // Logged by runSweep. exitCode rather than exit(): the pools still close below.
  process.exitCode = 1
} finally {
  await databases.close()
}
