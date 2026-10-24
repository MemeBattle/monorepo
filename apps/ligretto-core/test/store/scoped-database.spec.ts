// The Worker's per-request connection (a lazy client behind a pool-shaped adapter) on a real Postgres.
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createLazyClient, createScopedDatabase } from '../../src/adapters/pg/database'
import { disposableDatabaseUrl } from '../support/disposable-database'
import { resetAndMigrate } from '../support/postgres'

const url = disposableDatabaseUrl()
// Marks this suite's connections, so the count ignores the observer and anything else on the server.
const APPLICATION = 'ligretto-core-scoped-spec'
const scopedUrl = `${url}?application_name=${APPLICATION}`

describe('createScopedDatabase over createLazyClient', () => {
  const observer = new pg.Client({ connectionString: url })

  const connections = async () => {
    const { rows } = await observer.query<{ count: string }>('select count(*) from pg_stat_activity where application_name = $1', [APPLICATION])
    return Number(rows[0]?.count)
  }

  beforeAll(async () => {
    await resetAndMigrate(url)
    await observer.connect()
  })

  afterAll(async () => {
    await observer.end()
  })

  it('connects on the first statement, reuses the client, and close() ends it', async () => {
    const client = createLazyClient(scopedUrl)
    const db = createScopedDatabase(() => client.connect())
    expect(await connections()).toBe(0)
    expect(client.opened).toBe(false)

    const { id } = await db.insertInto('games').defaultValues().returning('id').executeTakeFirstOrThrow()
    expect(await connections()).toBe(1)
    await db.transaction().execute(async trx => {
      await trx.selectFrom('games').select('id').where('id', '=', id).forUpdate().execute()
      await trx.insertInto('rounds').values({ id: crypto.randomUUID(), game_id: id }).execute()
    })
    await db.selectFrom('rounds').selectAll().execute()
    expect(await connections()).toBe(1)

    await client.close()
    // The server notices the closed socket asynchronously.
    await expect.poll(connections).toBe(0)
  })

  it('opens a second client for a second scope', async () => {
    const first = createLazyClient(scopedUrl)
    const second = createLazyClient(scopedUrl)
    const a = createScopedDatabase(() => first.connect())
    const b = createScopedDatabase(() => second.connect())
    await a.selectFrom('games').select('id').execute()
    await b.selectFrom('games').select('id').execute()
    expect(await connections()).toBe(2)
    await Promise.all([first.close(), second.close()])
    await expect.poll(connections).toBe(0)
  })
})
