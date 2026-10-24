import { Kysely, PostgresDialect } from 'kysely'
import type { PostgresPool } from 'kysely'
import pg from 'pg'

import type { DatabaseConfig } from '../../core/config'
import type { DB } from './schema.generated'

/**
 * The database handles of docs/adrs/database-access-with-kysely.md. The adapters receive these `Kysely<DB>` instances
 * and nothing else: they never learn whether a process-wide pool or a per-request client is behind them.
 */
export type Database = Kysely<DB>

/** `main` for ordinary statements, `locks` for the lock transactions of docs/adrs/session-store-locking.md. */
export interface DatabaseHandles {
  main: Database
  locks: Database
}

/** Which handle a pool belongs to, for the report of its errors. */
export type DatabaseHandleName = keyof DatabaseHandles

/**
 * Reports an error `pg.Pool` emits for an idle client: a database restart, a terminated backend, an idle-session
 * timeout or a dropped connection. The pool has already discarded that client and the next statement connects anew,
 * so the callback only reports.
 */
export type PoolErrorHandler = (error: unknown, handle: DatabaseHandleName) => void

/**
 * A `pg.Pool` with its `error` listener attached before anything can use it. `pg.Pool` re-emits an idle client's
 * error on itself, and an `EventEmitter` with no `error` listener throws, which would end the process.
 */
export const createPool = (connectionString: string, poolConfig: pg.PoolConfig, onError: (error: unknown) => void): pg.Pool => {
  const pool = new pg.Pool({ ...poolConfig, connectionString })
  pool.on('error', onError)
  return pool
}

/**
 * Node: two `pg.Pool`s on the configured database for the life of the process. pg's default sizes until the session
 * store's saturation test (#836) sets them through `options`; a pool connects on its first statement, so an unused
 * handle costs nothing. `onError` receives what a pool reports about its idle clients (see `PoolErrorHandler`).
 */
export const createNodeDatabases = (
  config: DatabaseConfig,
  options: { onError: PoolErrorHandler; main?: pg.PoolConfig; locks?: pg.PoolConfig },
): DatabaseHandles & { close(): Promise<void> } => {
  const open = (handle: DatabaseHandleName, poolConfig: pg.PoolConfig = {}) =>
    new Kysely<DB>({
      dialect: new PostgresDialect({ pool: createPool(config.url, poolConfig, error => options.onError(error, handle)) }),
    })
  const main = open('main', options.main)
  const locks = open('locks', options.locks)
  return {
    main,
    locks,
    close: async () => {
      await Promise.all([main.destroy(), locks.destroy()])
    },
  }
}

/** One `pg` client opened on demand: the per-request connection of a Worker. */
export interface LazyClient {
  /** Opens the client on the first call and answers the same one afterwards; a failed connect stays failed. */
  connect(): Promise<pg.ClientBase>
  /** Ends the client if it was ever created; resolves at once otherwise. */
  close(): Promise<void>
  /** Whether `connect` was ever called. */
  readonly opened: boolean
}

type ClientConstructor = new (config: { connectionString: string }) => pg.Client

export const createLazyClient = (connectionString: string, Client: ClientConstructor = pg.Client): LazyClient => {
  let client: pg.Client | undefined
  let connected: Promise<pg.ClientBase> | undefined
  return {
    connect: () => {
      if (connected === undefined) {
        const created = new Client({ connectionString })
        // A client whose connection breaks while idle emits `error`, which would throw without a listener. The
        // failure reaches the request through its next statement, which rejects on the broken client.
        created.on('error', () => {})
        client = created
        connected = created.connect().then(() => created)
      }
      return connected
    },
    close: async () => {
      if (client === undefined) {
        return
      }
      // A client whose connect failed may reject on end as well; the request is over either way.
      await client.end().catch(() => {})
    },
    get opened() {
      return client !== undefined
    },
  }
}

/**
 * A database over whatever client `acquire` answers, for the Worker's per-request connections. `PostgresDialect`
 * wants a pool, so this is a pool-shaped object whose `connect` hands out the current client and whose `release`
 * keeps it open: closing it is the request scope's job.
 *
 * Kysely acquires a connection per statement and holds it for a whole transaction, so the statements of one handle
 * in one request run one after another on one client. A transaction and a concurrent statement on the *same* handle
 * in the *same* request would share that client and interleave; the design never does that (a lock transaction runs
 * on `locks` while its writes go to `main`, and the game transaction issues everything through `LockedGame`).
 */
export const createScopedDatabase = (acquire: () => Promise<pg.ClientBase>): Database => {
  const pool: PostgresPool = {
    // A no-op `release` on the client itself: the same object every time, so Kysely keeps one connection per client.
    connect: async () => Object.assign(await acquire(), { release: () => {} }),
    end: async () => {},
    options: {},
  }
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) })
}
