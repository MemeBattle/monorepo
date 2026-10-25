import { sql } from 'kysely'
import pg from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLazyClient, createNodeDatabases, createScopedDatabase } from './database.ts'
import type { DatabaseHandleName } from './database.ts'
import { createPgDatabaseProbe } from './probe.ts'

/**
 * A `pg.Client` that never opens a socket: `connect` and `end` succeed at once and every query answers one fixed row.
 * It keeps the real client's `EventEmitter`, so a test can break its connection with `emit('error', …)` the way pg
 * does when the server goes away.
 */
class OfflineClient extends pg.Client {
  static created: OfflineClient[] = []

  constructor(config?: string | pg.ClientConfig) {
    super(config)
    OfflineClient.created.push(this)
  }

  override connect(): Promise<pg.Client>
  override connect(callback: ((error: Error) => void) | ((error: null, client: pg.Client) => void)): void
  override connect(callback?: ((error: Error) => void) | ((error: null, client: pg.Client) => void)): Promise<pg.Client> | void {
    if (callback === undefined) {
      return Promise.resolve(this)
    }
    queueMicrotask(() => (callback as (error: null, client: pg.Client) => void)(null, this))
  }

  override end(): Promise<void>
  override end(callback: (error: Error) => void): void
  override end(callback?: (error: Error) => void): Promise<void> | void {
    if (callback === undefined) {
      return Promise.resolve()
    }
    queueMicrotask(() => callback(undefined as unknown as Error))
  }

  override query = (async () => ({ command: 'SELECT', rowCount: 1, rows: [{ one: 1 }], fields: [], oid: 0 })) as unknown as pg.Client['query']
}

/** An `OfflineClient` that records the text of every statement it is sent. */
class RecordingOfflineClient extends OfflineClient {
  queries: string[] = []

  override query = (async (text: string) => {
    this.queries.push(text)
    return { command: 'SELECT', rowCount: 1, rows: [{ one: 1 }], fields: [], oid: 0 }
  }) as unknown as pg.Client['query']
}

const config = { url: 'postgres://user:password@localhost:1/offline-test' }

/** A promise and the function that resolves it. */
const gate = () => {
  let open!: () => void
  const opened = new Promise<void>(resolve => {
    open = resolve
  })
  return { open, opened }
}

/** Lets every pending continuation run, so a statement that could start has started. */
const settle = () => new Promise(resolve => setTimeout(resolve, 10))

afterEach(() => {
  OfflineClient.created = []
})

describe('createNodeDatabases', () => {
  it('reports an idle client error to onError and answers the next statement on a fresh client', async () => {
    const reported: Array<{ error: unknown; handle: DatabaseHandleName }> = []
    const databases = createNodeDatabases(config, {
      onError: (error, handle) => reported.push({ error, handle }),
      main: { Client: OfflineClient },
    })
    try {
      const probe = createPgDatabaseProbe(databases.main)
      await probe.ping()
      const [idle] = OfflineClient.created
      expect(OfflineClient.created).toHaveLength(1)

      const failure = new Error('terminating connection due to administrator command')
      // Without a listener on the pool, pg-pool's re-emit throws right here, outside any query promise.
      expect(() => idle?.emit('error', failure)).not.toThrow()
      expect(reported).toEqual([{ error: failure, handle: 'main' }])

      await expect(probe.ping()).resolves.toBeUndefined()
      expect(OfflineClient.created).toHaveLength(2)
    } finally {
      await databases.close()
    }
  })

  it('names the locks handle in its report', async () => {
    const reported: DatabaseHandleName[] = []
    const databases = createNodeDatabases(config, {
      onError: (_error, handle) => reported.push(handle),
      locks: { Client: OfflineClient },
    })
    try {
      await createPgDatabaseProbe(databases.locks).ping()
      OfflineClient.created[0]?.emit('error', new Error('connection lost'))
      expect(reported).toEqual(['locks'])
    } finally {
      await databases.close()
    }
  })
})

describe('createLazyClient', () => {
  it('survives an error its client emits while idle', async () => {
    const lazy = createLazyClient(config.url, OfflineClient)
    const client = await lazy.connect()
    expect(() => client.emit('error', new Error('connection lost'))).not.toThrow()
    await lazy.close()
  })
})

describe('createLazyClient after close()', () => {
  it('opens nothing when closed before any connect', async () => {
    const lazy = createLazyClient(config.url, OfflineClient)
    await lazy.close()
    await expect(lazy.connect()).rejects.toThrow('database client closed')
    expect(OfflineClient.created).toEqual([])
    expect(lazy.opened).toBe(false)
  })

  it('refuses a connect after closing the client it opened, and ends that client once', async () => {
    const lazy = createLazyClient(config.url, OfflineClient)
    await lazy.connect()
    const [client] = OfflineClient.created
    const end = vi.spyOn(client as OfflineClient, 'end')
    await lazy.close()
    await expect(lazy.connect()).rejects.toThrow('database client closed')
    expect(OfflineClient.created).toHaveLength(1)
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('refuses a connect issued while the close is still in flight', async () => {
    const lazy = createLazyClient(config.url, OfflineClient)
    const closing = lazy.close()
    await expect(lazy.connect()).rejects.toThrow('database client closed')
    await closing
    expect(OfflineClient.created).toEqual([])
  })
})

describe('createScopedDatabase', () => {
  it('leases one client to one acquirer at a time', async () => {
    const client = new RecordingOfflineClient(config.url)
    const db = createScopedDatabase(async () => client)
    const releaseA = gate()

    const a = db.transaction().execute(async trx => {
      await sql`select 'a'`.execute(trx)
      await releaseA.opened
    })
    await expect.poll(() => client.queries).toEqual(['begin', "select 'a'"])

    // Both wait for A's commit instead of running inside its transaction.
    const plain = sql`select 'plain'`.execute(db)
    await settle()
    const b = db.transaction().execute(async trx => {
      await sql`select 'b'`.execute(trx)
    })
    await settle()
    expect(client.queries).toEqual(['begin', "select 'a'"])

    releaseA.open()
    await Promise.all([a, plain, b])
    expect(client.queries).toEqual(['begin', "select 'a'", 'commit', "select 'plain'", 'begin', "select 'b'", 'commit'])
  })

  it('never makes one client wait for another behind the same handle', async () => {
    const first = new RecordingOfflineClient(config.url)
    const second = new RecordingOfflineClient(config.url)
    // The unit model of the request scope: one handle, a different client per request.
    let current = first
    const db = createScopedDatabase(async () => current)
    const releaseA = gate()

    const a = db.transaction().execute(async trx => {
      await sql`select 'a'`.execute(trx)
      await releaseA.opened
    })
    await expect.poll(() => first.queries).toEqual(['begin', "select 'a'"])

    current = second
    await sql`select 'other'`.execute(db)
    expect(second.queries).toEqual(["select 'other'"])
    expect(first.queries).toEqual(['begin', "select 'a'"])

    releaseA.open()
    await a
    expect(first.queries).toEqual(['begin', "select 'a'", 'commit'])
  })

  it('takes no lease for a failed acquire', async () => {
    const client = new RecordingOfflineClient(config.url)
    let fail = true
    const db = createScopedDatabase(async () => {
      if (fail) {
        fail = false
        throw new Error('connect failed')
      }
      return client
    })
    await expect(sql`select 'first'`.execute(db)).rejects.toThrow('connect failed')
    await sql`select 'next'`.execute(db)
    expect(client.queries).toEqual(["select 'next'"])
  })
})
