import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

import type { Database, DatabaseHandles } from '../../src/adapters/pg/database.ts'
import type { DB } from '../../src/adapters/pg/schema.generated.ts'
import { resetDatabase } from './disposable-database.ts'
import { migrate } from './migrations.ts'

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
export const openDatabase = (url: string, pool: pg.PoolConfig = {}): Database =>
  new Kysely<DB>({ dialect: new PostgresDialect({ pool: new pg.Pool({ ...pool, connectionString: url }) }) })

export type OpenHandles = DatabaseHandles & {
  /** The two pools behind the handles, so a test can wait on `waitingCount` instead of sleeping. */
  pools: { main: pg.Pool; locks: pg.Pool }
  close(): Promise<void>
}

/** `main` and `locks` over two pools of their own, sized as the test needs, as the Node entry builds them. */
export const openHandles = (url: string, { main = {}, locks = {} }: { main?: pg.PoolConfig; locks?: pg.PoolConfig } = {}): OpenHandles => {
  const pools = { main: new pg.Pool({ ...main, connectionString: url }), locks: new pg.Pool({ ...locks, connectionString: url }) }
  const handles = {
    main: new Kysely<DB>({ dialect: new PostgresDialect({ pool: pools.main }) }),
    locks: new Kysely<DB>({ dialect: new PostgresDialect({ pool: pools.locks }) }),
  }
  return {
    ...handles,
    pools,
    close: async () => {
      await Promise.all([handles.main.destroy(), handles.locks.destroy()])
    },
  }
}
