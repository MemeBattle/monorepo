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
 * Node: two `pg.Pool`s on the configured database for the life of the process. The Node entry sets their sizes
 * through `options`; the store suite's saturation tests run on smaller pools. A pool connects on its first statement,
 * so an unused handle costs nothing. `onError` receives what a pool reports about its idle clients (see
 * `PoolErrorHandler`).
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
  /**
   * Opens the client on the first call and answers the same one afterwards; a failed connect stays failed; after
   * `close()` it rejects without opening anything.
   */
  connect(): Promise<pg.ClientBase>
  /** Marks the client closed, then ends it if it was ever created; resolves at once otherwise. */
  close(): Promise<void>
  /** Whether `connect` ever created the client. */
  readonly opened: boolean
}

type ClientConstructor = new (config: { connectionString: string }) => pg.Client

export const createLazyClient = (connectionString: string, Client: ClientConstructor = pg.Client): LazyClient => {
  let client: pg.Client | undefined
  let connected: Promise<pg.ClientBase> | undefined
  let closed = false
  return {
    connect: () => {
      if (closed) {
        // A statement that outlived its request: opening a client now would leak it, since the scope's close has run.
        return Promise.reject(new Error('database client closed'))
      }
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
      // Set before the first `await`, so a `connect()` issued while the close is in flight is refused too.
      closed = true
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
 * Kysely acquires a connection per statement and holds it for a whole transaction. The adapter leases each client to
 * one acquirer at a time, keyed to the client `acquire` answers and not to the handle: the handles are built once per
 * isolate and `acquire` resolves the current request's client, so a statement issued on a handle while the same
 * request's transaction is open on that handle waits for the commit instead of interleaving with it, while another
 * request's client on the same handle is never delayed. The design never issues such a statement (a lock transaction
 * runs on `locks` while its writes go to `main`; the game transaction issues everything through `LockedGame`), and a
 * lock take the deadline abandoned finishes rolling back before the request's next statement on the handle runs
 * (docs/adrs/session-store-locking.md). A closed `LazyClient` refuses to connect, so a statement that outlives its
 * request fails instead of leaking a connection.
 */
export const createScopedDatabase = (acquire: () => Promise<pg.ClientBase>): Database => {
  /** Each client's current holder, as the promise its `release` resolves; a client with no entry is free. */
  const leases = new WeakMap<pg.ClientBase, Promise<void>>()
  const lease = (client: pg.ClientBase): Promise<() => void> => {
    const previous = leases.get(client) ?? Promise.resolve()
    let release!: () => void
    // Read and set with no `await` between, so concurrent acquirers of one client chain up in the order they came.
    // Resolving is idempotent, so a second call of one grant's `release` cannot release the next holder.
    leases.set(
      client,
      new Promise<void>(resolve => {
        release = resolve
      }),
    )
    return previous.then(() => release)
  }
  const pool: PostgresPool = {
    // The client first, then its lease: the client is the key. A rejected `acquire` takes no lease. The `release` is
    // set per grant on the same object, so Kysely keeps one connection per client and frees the lease through it.
    connect: async () => {
      const client = await acquire()
      const release = await lease(client)
      return Object.assign(client, { release })
    },
    end: async () => {},
    options: {},
  }
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) })
}
