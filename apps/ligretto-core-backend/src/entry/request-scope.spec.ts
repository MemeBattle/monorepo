import { EventEmitter } from 'node:events'

import type pg from 'pg'
import { describe, expect, it } from 'vitest'

import { createLazyClient } from '../adapters/pg/database.ts'
import { createRequestScopeRunner } from './request-scope.ts'

/**
 * A `pg.Client` stand-in that records its lifecycle and answers every query with one fixed row. Once ended it refuses
 * every query before recording it, as pg does.
 */
class RecordingClient extends EventEmitter {
  static created: RecordingClient[] = []
  readonly connectionString: string
  connects = 0
  ends = 0
  closed = false
  queries: string[] = []

  constructor({ connectionString }: { connectionString: string }) {
    super()
    this.connectionString = connectionString
    RecordingClient.created.push(this)
  }

  async connect() {
    this.connects += 1
  }

  async end() {
    this.ends += 1
    this.closed = true
  }

  async query(text: string) {
    if (this.closed) {
      throw new Error('Client was closed and is not queryable')
    }
    this.queries.push(text)
    return { command: 'SELECT', rowCount: 1, rows: [{ one: 1 }] }
  }
}

const setup = () => {
  RecordingClient.created = []
  const runner = createRequestScopeRunner({
    openClient: connectionString =>
      createLazyClient(connectionString, RecordingClient as unknown as new (config: { connectionString: string }) => pg.Client),
  })
  const scheduled: Array<Promise<unknown>> = []
  const waitUntil = (promise: Promise<unknown>) => {
    scheduled.push(promise)
  }
  const select = (db: typeof runner.handles.main) => db.selectNoFrom(eb => [eb.lit(1).as('one')]).execute()
  const selectText = runner.handles.main.selectNoFrom(eb => [eb.lit(1).as('one')]).compile().sql
  const client = (name: string) => RecordingClient.created.find(created => created.connectionString === `postgres://${name}`)
  return { runner, scheduled, waitUntil, select, selectText, client, clients: () => RecordingClient.created }
}

/** A promise and the function that resolves it. */
const gate = () => {
  let open!: () => void
  const opened = new Promise<void>(resolve => {
    open = resolve
  })
  return { open, opened }
}

const bindings = (request: string) => ({ main: `postgres://main/${request}`, locks: `postgres://locks/${request}` })

describe('createRequestScopeRunner', () => {
  it('opens one client on the handle a statement used and none on the other', async () => {
    const { runner, waitUntil, select, clients } = setup()
    const rows = await runner.run(bindings('a'), waitUntil, async () => {
      await select(runner.handles.main)
      await select(runner.handles.main)
      return select(runner.handles.main)
    })
    expect(rows).toEqual([{ one: 1 }])
    expect(clients().map(client => client.connectionString)).toEqual(['postgres://main/a'])
    expect(clients()[0]?.connects).toBe(1)
    expect(clients()[0]?.queries).toHaveLength(3)
  })

  it('gives overlapping requests their own clients', async () => {
    const { runner, waitUntil, select, clients } = setup()
    let releaseA!: () => void
    const gateA = new Promise<void>(resolve => {
      releaseA = resolve
    })
    const a = runner.run(bindings('a'), waitUntil, async () => {
      await select(runner.handles.main)
      await gateA
      await select(runner.handles.main)
    })
    const b = runner.run(bindings('b'), waitUntil, async () => {
      await select(runner.handles.main)
      await select(runner.handles.locks)
      releaseA()
    })
    await Promise.all([a, b])
    const byString = Object.fromEntries(clients().map(client => [client.connectionString, client.queries.length]))
    expect(byString).toEqual({ 'postgres://main/a': 2, 'postgres://main/b': 1, 'postgres://locks/b': 1 })
  })

  it('closes every opened client in waitUntil after the request', async () => {
    const { runner, scheduled, waitUntil, select, clients } = setup()
    await runner.run(bindings('a'), waitUntil, async () => {
      await select(runner.handles.main)
      await select(runner.handles.locks)
      expect(scheduled).toHaveLength(0)
    })
    expect(scheduled).toHaveLength(1)
    await Promise.all(scheduled)
    expect(clients().map(client => client.ends)).toEqual([1, 1])
  })

  it('closes the clients when the request fails, and the failure propagates', async () => {
    const { runner, scheduled, waitUntil, select, clients } = setup()
    const failure = new Error('handler failed')
    await expect(
      runner.run(bindings('a'), waitUntil, async () => {
        await select(runner.handles.main)
        throw failure
      }),
    ).rejects.toBe(failure)
    await Promise.all(scheduled)
    expect(clients().map(client => client.ends)).toEqual([1])
  })

  it('opens nothing for a request that never touches the database', async () => {
    const { runner, scheduled, waitUntil, clients } = setup()
    expect(await runner.run(bindings('a'), waitUntil, async () => 'no database')).toBe('no database')
    expect(scheduled).toHaveLength(1)
    await Promise.all(scheduled)
    expect(clients()).toEqual([])
  })

  it('never makes a request wait for another one parked in a transaction on the same handles', async () => {
    const { runner, scheduled, waitUntil, select, selectText, client, clients } = setup()
    const gateA = gate()
    const a = runner.run(bindings('a'), waitUntil, async () => {
      await Promise.all([
        runner.handles.main.transaction().execute(async trx => {
          await select(trx)
          await gateA.opened
        }),
        runner.handles.locks.transaction().execute(async trx => {
          await select(trx)
          await gateA.opened
        }),
      ])
    })
    let aSettled = false
    void a.finally(() => {
      aSettled = true
    })
    await expect
      .poll(() => [client('main/a')?.queries, client('locks/a')?.queries])
      .toEqual([
        ['begin', selectText],
        ['begin', selectText],
      ])

    const b = runner.run(bindings('b'), waitUntil, async () => {
      await select(runner.handles.main)
      await runner.handles.main.transaction().execute(async trx => {
        await select(trx)
      })
      await select(runner.handles.locks)
      return 'b done'
    })

    // B completed while A still holds both of its clients in open transactions.
    expect(await b).toBe('b done')
    expect(aSettled).toBe(false)
    expect(client('main/b')?.queries).toEqual([selectText, 'begin', selectText, 'commit'])
    expect(client('locks/b')?.queries).toEqual([selectText])
    expect(client('main/a')?.queries).toEqual(['begin', selectText])
    expect(client('locks/a')?.queries).toEqual(['begin', selectText])

    gateA.open()
    await a
    expect(client('main/a')?.queries).toEqual(['begin', selectText, 'commit'])
    expect(client('locks/a')?.queries).toEqual(['begin', selectText, 'commit'])
    await Promise.all(scheduled)
    expect(clients().map(created => created.ends)).toEqual([1, 1, 1, 1])
  })

  it('fails a statement queued behind a transaction when the scope closes, without opening a client', async () => {
    const { runner, scheduled, waitUntil, select, selectText, client, clients } = setup()
    const release = gate()
    const { transaction, statement } = await runner.run(bindings('a'), waitUntil, async () => {
      const transaction = runner.handles.main.transaction().execute(async trx => {
        await select(trx)
        await release.opened
      })
      await expect.poll(() => client('main/a')?.queries).toEqual(['begin', selectText])
      // Waits on the client's lease: the handler returns without awaiting either.
      const statement = select(runner.handles.main)
      return { transaction, statement }
    })
    await Promise.all(scheduled)
    expect(client('main/a')?.ends).toBe(1)

    release.open()
    await expect(transaction).rejects.toThrow('Client was closed')
    await expect(statement).rejects.toThrow('Client was closed')
    expect(clients().map(created => created.connectionString)).toEqual(['postgres://main/a'])
    expect(client('main/a')?.connects).toBe(1)
    expect(client('main/a')?.ends).toBe(1)
    expect(client('main/a')?.queries).toEqual(['begin', selectText])
  })

  it('opens no client for a statement issued after the scope closed', async () => {
    const { runner, scheduled, waitUntil, select, clients } = setup()
    const release = gate()
    let later: Promise<unknown> | undefined
    await runner.run(bindings('a'), waitUntil, async () => {
      // The continuation inherits the request's scope, and runs after it closed.
      later = release.opened.then(() => select(runner.handles.locks))
    })
    await Promise.all(scheduled)
    expect(clients()).toEqual([])

    release.open()
    await expect(later).rejects.toThrow('database client closed')
    expect(clients()).toEqual([])
  })

  it('refuses a statement outside any request scope', async () => {
    const { runner, select } = setup()
    await expect(select(runner.handles.main)).rejects.toThrow('database used outside a request scope')
  })
})
