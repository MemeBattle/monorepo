import { EventEmitter } from 'node:events'

import type pg from 'pg'
import { describe, expect, it } from 'vitest'

import { createLazyClient } from '../adapters/pg/database'
import { createRequestScopeRunner } from './request-scope'

/** A `pg.Client` stand-in that records its lifecycle and answers every query with one fixed row. */
class RecordingClient extends EventEmitter {
  static created: RecordingClient[] = []
  readonly connectionString: string
  connects = 0
  ends = 0
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
  }

  async query(text: string) {
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
  return { runner, scheduled, waitUntil, select, clients: () => RecordingClient.created }
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

  it('refuses a statement outside any request scope', async () => {
    const { runner, select } = setup()
    await expect(select(runner.handles.main)).rejects.toThrow('database used outside a request scope')
  })
})
