import { PGlite } from '@electric-sql/pglite'
import { Kysely, PGliteDialect } from 'kysely'

import type { Database } from '../../src/adapters/pg/database.ts'
import type { DB } from '../../src/adapters/pg/schema.generated.ts'
import { migrate } from './migrations.ts'

/**
 * An in-memory PGlite database with the real migrations applied (docs/adrs/testing-strategy.md). One per spec file,
 * in `beforeAll`; PGlite has one connection, so nothing that needs two runs here.
 */
export const createTestDatabase = async (): Promise<{ db: Database; close(): Promise<void> }> => {
  const db = new Kysely<DB>({ dialect: new PGliteDialect({ pglite: () => new PGlite() }) })
  await migrate(db)
  return { db, close: () => db.destroy() }
}
