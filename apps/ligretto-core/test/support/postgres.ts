import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

import type { Database } from '../../src/adapters/pg/database'
import type { DB } from '../../src/adapters/pg/schema.generated'
import { resetDatabase } from './disposable-database'
import { migrate } from './migrations'

export const resetAndMigrate = async (url: string): Promise<void> => {
  await resetDatabase(url)
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }) })
  try {
    await migrate(db)
  } finally {
    await db.destroy()
  }
}

/** A database over its own `pg.Pool`, so two of them are two independent sets of connections. */
export const openDatabase = (url: string): Database =>
  new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url }) }) })
