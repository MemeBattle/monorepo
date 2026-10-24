import pg from 'pg'
import { afterEach, describe, expect, it } from 'vitest'

import { createLazyClient, createNodeDatabases } from './database'
import type { DatabaseHandleName } from './database'
import { createPgDatabaseProbe } from './probe'

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

const config = { url: 'postgres://user:password@localhost:1/offline-test' }

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
