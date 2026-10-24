// Applies the migrations in ../../migrations to DATABASE_URL (docs/MIGRATIONS.md). Run through `tsx` (`pnpm migrate`),
// which is what lets the provider's `import()` load the TypeScript migrations. The serving process never migrates.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Kysely, PostgresDialect } from 'kysely'
import { FileMigrationProvider, Migrator } from 'kysely/migration'

import { createConsoleLogger } from '../adapters/console-logger'
import { createPool } from '../adapters/pg/database'
import { loadDatabaseConfig, loadLoggingConfig } from '../core/config'
import { loadDevelopmentEnv } from './env'

loadDevelopmentEnv()

// The database and logging sections only; a ConfigError escapes and names every offending variable.
const database = loadDatabaseConfig(process.env)
const logging = loadLoggingConfig(process.env)
const logger = createConsoleLogger({ level: logging.level })

// A pool error is logged; the statement that runs into the broken connection fails the migration on its own.
const pool = createPool(database.url, { max: 1 }, error => {
  logger.error('database_pool_error', { error: error instanceof Error ? error.message : String(error) })
})
const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) })

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({ fs, path, migrationFolder: fileURLToPath(new URL('../../migrations', import.meta.url)) }),
})

try {
  // migrateToLatest reports a failure in its result set instead of throwing it.
  const { error, results = [] } = await migrator.migrateToLatest()
  for (const result of results) {
    logger.info('migration', { name: result.migrationName, status: result.status, direction: result.direction })
  }
  if (results.length === 0 && error === undefined) {
    logger.info('no pending migrations')
  }
  if (error !== undefined) {
    logger.error('migration_failed', { error: error instanceof Error ? error.message : String(error) })
    // exitCode rather than exit(): the pool still closes below.
    process.exitCode = 1
  }
} finally {
  await db.destroy()
}
