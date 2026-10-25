// Runs the scheduled sweep once against DATABASE_URL (docs/adrs/session-store-locking.md) and exits: expired
// authorization requests, sessions past the cookie grace (each under its lock) and orphaned lock rows. Run through
// `tsx --conditions=development` (`pnpm sweep`), which resolves `@memebattle/ligretto-auth` from source.
import { SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'

import { createConsoleLogger } from '../adapters/console-logger'
import { createPgAuthSweepStore } from '../adapters/pg/auth-sweep-store'
import { createNodeDatabases } from '../adapters/pg/database'
import { systemClock } from '../adapters/system-clock'
import { loadDatabaseConfig, loadLoggingConfig } from '../core/config'
import { createSweepExpiredAuth } from '../core/sweep'
import { loadDevelopmentEnv } from './env'

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
  const counts = await sweep()
  logger.info('sweep_completed', { ...counts })
  if (counts.failedSessions > 0) {
    logger.warn('sweep_sessions_left', { failedSessions: counts.failedSessions })
  }
} catch (failure) {
  logger.error('sweep_failed', { error: failure instanceof Error ? failure.message : String(failure) })
  // exitCode rather than exit(): the pools still close below.
  process.exitCode = 1
} finally {
  await databases.close()
}
