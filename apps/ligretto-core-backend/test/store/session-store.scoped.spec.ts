// The Postgres SessionStore over the Worker's adapter: two lazy clients behind scoped databases, as
// src/entry/request-scope.ts builds them, with a pool-backed holder as the other party.
import { SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createLazyClient, createScopedDatabase } from '../../src/adapters/pg/database'
import type { DatabaseHandles, LazyClient } from '../../src/adapters/pg/database'
import { acquireSessionLock, createPgSessionStore } from '../../src/adapters/pg/session-store'
import type { SessionLockOptions } from '../../src/adapters/pg/session-store'
import { createFixedClock } from '../../src/core/ports/clock.fake'
import { SessionBusyError } from '../../src/core/ports/session-store'
import { disposableDatabaseUrl } from '../support/disposable-database'
import { openHandles, resetAndMigrate } from '../support/postgres'
import type { OpenHandles } from '../support/postgres'
import { createLockObserver, gate, sessionOf, truncateAuthTables } from '../support/session-store'

const url = disposableDatabaseUrl()
// Marks the scoped clients' connections, so a count ignores the pools, the observer and anything else on the server.
const APPLICATION = 'ligretto-core-scoped-store-spec'
const scopedUrl = `${url}?application_name=${APPLICATION}`
const NOW = 10 * SESSION_COOKIE_GRACE_MS
const LOCK_SELECT = /^select\b.*"session_locks".*\bfor update$/i

type Pair = { main: LazyClient; locks: LazyClient }

const openPair = (): Pair => ({ main: createLazyClient(scopedUrl), locks: createLazyClient(scopedUrl) })
const closePair = async (pair: Pair) => {
  await Promise.all([pair.main.close(), pair.locks.close()])
}

/** One request's handles, as the runner resolves them: each handle answers that request's lazy client. */
const scopedHandles = (current: () => Pair): DatabaseHandles => ({
  main: createScopedDatabase(() => current().main.connect()),
  locks: createScopedDatabase(() => current().locks.connect()),
})

const failureOf = async (promise: Promise<unknown>): Promise<{ error: unknown; elapsed: number }> => {
  const start = performance.now()
  const error = await promise.then(
    () => undefined,
    (failure: unknown) => failure,
  )
  return { error, elapsed: performance.now() - start }
}

describe('the Postgres SessionStore over scoped clients', () => {
  let pool: OpenHandles
  const observer = createLockObserver(url)

  const storeOver = (handles: DatabaseHandles, lock: SessionLockOptions = {}) => createPgSessionStore(handles, { clock: createFixedClock(NOW), lock })

  /** A holder of `id`'s lock through the pools, parked until `release()`. */
  const holdOnPool = (id: string) => {
    const entered = gate()
    const released = gate()
    const done = acquireSessionLock(pool.locks, id, async () => {
      entered.open()
      await released.opened
      return 'held' as const
    })
    return { entered: entered.opened, release: released.open, done }
  }

  const lockRows = async (id: string) => (await pool.main.selectFrom('session_locks').select('id').where('id', '=', id).execute()).length

  /** The open connections of the scoped clients. */
  const connections = async () => {
    const { rows } = await sql<{ count: string }>`select count(*) from pg_stat_activity where application_name = ${APPLICATION}`.execute(pool.main)
    return Number(rows[0]?.count)
  }

  beforeAll(async () => {
    await resetAndMigrate(url)
    pool = openHandles(url)
    await observer.connect()
  })

  afterAll(async () => {
    await observer.end()
    await pool.close()
  })

  beforeEach(async () => {
    await truncateAuthTables(pool.main)
    // A committed row for `x`, so a take of it blocks on the select rather than the insert.
    await storeOver(pool).withSessionLock('x', async () => undefined)
  })

  it('lets a take abandoned at its deadline roll back before the next take on the same client', async () => {
    const pair = openPair()
    const handles = scopedHandles(() => pair)
    // Two stores over the same handles and clients, with different budgets.
    const hasty = storeOver(handles, { deadlineMs: 300, lockTimeoutMs: 5000 })
    const patient = storeOver(handles, { deadlineMs: 5000 })
    const holder = holdOnPool('x')
    try {
      await holder.entered
      const { error, elapsed } = await failureOf(hasty.withSessionLock('x', async () => 'never'))
      expect(error).toBeInstanceOf(SessionBusyError)
      expect(['deadline', 'lock_timeout']).toContain((error as SessionBusyError).reason)
      expect(elapsed).toBeLessThan(2000)

      // At once, on the same scoped locks client: it waits for the abandoned transaction's rollback through the lease
      // instead of issuing its BEGIN inside it.
      expect(await patient.withSessionLock('y', async () => 'held')).toBe('held')
      expect(await lockRows('y')).toBe(1)
      expect(await observer.idleInTransaction(APPLICATION)).toBe(0)
      expect(await sql<{ one: number }>`select 1 as one`.execute(handles.locks)).toMatchObject({ rows: [{ one: 1 }] })
      holder.release()
      expect(await holder.done).toBe('held')
      expect(await patient.withSessionLock('x', async () => 'held')).toBe('held')
    } finally {
      holder.release()
      await closePair(pair)
    }
  })

  it('writes the callback on main while locks holds the row: two clients', async () => {
    const pair = openPair()
    const store = storeOver(scopedHandles(() => pair))
    const session = sessionOf({ id: 'scoped-save', sub: 'account-scoped-save' })

    try {
      await store.withSessionLock(session.id, async () => {
        await store.saveSession(session)
        expect(await connections()).toBe(2)
      })
      expect(await storeOver(pool).getSession(session.id)).toStrictEqual(session)
    } finally {
      await closePair(pair)
    }
    await expect.poll(connections).toBe(0)
  })

  it('bounds a take queued behind the same client without it reaching Postgres', async () => {
    const pair = openPair()
    const handles = scopedHandles(() => pair)
    const patient = storeOver(handles, { deadlineMs: 5000, lockTimeoutMs: 5000 })
    const hasty = storeOver(handles, { deadlineMs: 300 })
    const holder = holdOnPool('x')
    try {
      await holder.entered
      let firstSettled = false
      const first = patient.withSessionLock('x', async () => 'held')
      void first.finally(() => {
        firstSettled = true
      })
      await expect.poll(observer.blockedStatements).toEqual([expect.stringMatching(LOCK_SELECT)])

      // Queued on the client's lease behind the first take's open transaction.
      const { error, elapsed } = await failureOf(hasty.withSessionLock('x', async () => 'never'))
      expect(error).toBeInstanceOf(SessionBusyError)
      expect((error as SessionBusyError).reason).toBe('deadline')
      expect(elapsed).toBeLessThan(2000)
      // The first is still waiting, and still the only waiter in the database.
      expect(firstSettled).toBe(false)
      expect(await observer.blockedStatements()).toEqual([expect.stringMatching(LOCK_SELECT)])

      holder.release()
      expect(await first).toBe('held')
      await holder.done
      // The abandoned take got the client after the first committed, and rolled back without a statement.
      await expect.poll(() => observer.idleInTransaction(APPLICATION)).toBe(0)
      expect(await lockRows('x')).toBe(1)
    } finally {
      holder.release()
      await closePair(pair)
    }
  })

  it('never makes two requests behind the same handles wait for each other', async () => {
    const pairs = { a: openPair(), b: openPair() }
    // The isolate's handles, built once; which request's clients they resolve is switched by the test.
    let current = pairs.a
    const handles = scopedHandles(() => current)
    const first = storeOver(handles, { deadlineMs: 5000, lockTimeoutMs: 5000 })
    const second = storeOver(handles, { deadlineMs: 5000 })
    const holder = holdOnPool('x')
    try {
      await holder.entered
      let firstSettled = false
      const parked = first.withSessionLock('x', async () => 'held')
      void parked.finally(() => {
        firstSettled = true
      })
      await expect.poll(observer.blockedStatements).toEqual([expect.stringMatching(LOCK_SELECT)])

      current = pairs.b
      expect(await second.withSessionLock('y', async () => 'held')).toBe('held')
      expect(firstSettled).toBe(false)
      expect(await observer.blockedStatements()).toEqual([expect.stringMatching(LOCK_SELECT)])

      holder.release()
      expect(await parked).toBe('held')
      await holder.done
    } finally {
      holder.release()
      await Promise.all([closePair(pairs.a), closePair(pairs.b)])
    }
    await expect.poll(connections).toBe(0)
  })
})
