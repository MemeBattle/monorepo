// The Postgres SessionStore on a real server: the lock needs two connections and row locks, which PGlite cannot host.
import { refreshSession, SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'
import type { PendingAuthorizationRequest, SessionContext } from '@memebattle/ligretto-auth'
import type { Transaction } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '../../src/adapters/pg/database'
import type { DB } from '../../src/adapters/pg/schema.generated'
import { acquireSessionLock, createPgSessionStore } from '../../src/adapters/pg/session-store'
import type { SessionLockOptions } from '../../src/adapters/pg/session-store'
import { createFixedClock } from '../../src/core/ports/clock.fake'
import { SessionBusyError } from '../../src/core/ports/session-store'
import { disposableDatabaseUrl } from '../support/disposable-database'
import { openHandles, resetAndMigrate } from '../support/postgres'
import type { OpenHandles } from '../support/postgres'
import { createGatedCas, createLockObserver, gate, refreshTokenFor, sessionOf, sleep, truncateAuthTables, until } from '../support/session-store'

const url = disposableDatabaseUrl()
/** Far enough along that a whole grace window still leaves positive epochs to write. */
const NOW = 10 * SESSION_COOKIE_GRACE_MS
/** What a `select … for update` of the lock row looks like in `pg_stat_activity`. */
const LOCK_SELECT = /^select\b.*"session_locks".*\bfor update$/i
const LOCK_INSERT = /^insert into "session_locks"/i

/**
 * A holder of `id`'s lock on `locks`, parked inside the lock until `release()`; `onRelease` runs on the lock
 * transaction after that, before the commit.
 */
const holdLock = (locks: Database, id: string, onRelease?: (lock: Transaction<DB>) => Promise<unknown>) => {
  const entered = gate()
  const released = gate()
  const done = acquireSessionLock(locks, id, async lock => {
    entered.open()
    await released.opened
    await onRelease?.(lock)
    return 'held' as const
  })
  return { entered: entered.opened, release: released.open, done }
}

/** The rejection of `promise` and how long it took, in ms of real time. */
const failureOf = async (promise: Promise<unknown>): Promise<{ error: unknown; elapsed: number }> => {
  const start = performance.now()
  const error = await promise.then(
    () => undefined,
    (failure: unknown) => failure,
  )
  return { error, elapsed: performance.now() - start }
}

const busy = (error: unknown): SessionBusyError => {
  expect(error).toBeInstanceOf(SessionBusyError)
  return error as SessionBusyError
}

describe('the Postgres SessionStore', () => {
  let handles: OpenHandles
  const observer = createLockObserver(url)

  /** A store over `on` with the given lock bounds, stamping and expiring against a fixed clock. */
  const storeOf = (lock: SessionLockOptions = {}, on: OpenHandles = handles, clock = createFixedClock(NOW)) =>
    createPgSessionStore(on, { clock, lock })

  const lockRows = async (id: string) => (await handles.main.selectFrom('session_locks').select('id').where('id', '=', id).execute()).length

  beforeAll(async () => {
    await resetAndMigrate(url)
    // The sizes the Node entry runs with.
    handles = openHandles(url, { main: { max: 5 }, locks: { max: 10 } })
    await observer.connect()
  })

  afterAll(async () => {
    await observer.end()
    await handles.close()
  })

  beforeEach(async () => {
    await truncateAuthTables(handles.main)
  })

  describe('the lock', () => {
    it('lets two concurrent refreshes of one session cost CAS a single token request', async () => {
      const store = storeOf()
      const session = sessionOf({ id: 'one-request', sub: 'account-one-request' })
      await store.saveSession(session)

      const cas = createGatedCas()
      const ctx: SessionContext = { client: cas.client, store }
      const first = refreshSession(ctx, session.id)
      const second = refreshSession(ctx, session.id)

      // Held at CAS: whichever caller took the lock is inside it, and the other is queued behind the lock rather than
      // on its way to CAS.
      await until(() => cas.refreshCalls.length === 1, { label: 'the holder to reach CAS' })
      cas.release()
      const [a, b] = await Promise.all([first, second])

      expect(cas.refreshCalls).toEqual([refreshTokenFor(session.sub, 0)])
      // The waiter re-read the session inside the lock, found the token the holder had just stored and skipped.
      const rotated = refreshTokenFor(session.sub, 1)
      expect(a.refreshToken).toBe(rotated)
      expect(b.refreshToken).toBe(rotated)
      expect((await store.getSession(session.id))?.refreshToken).toBe(rotated)
    })

    it('never lets two holders of one id overlap', async () => {
      const store = storeOf()
      const events: string[] = []
      const hold = (name: string) =>
        store.withSessionLock('serialise', async () => {
          events.push(`enter:${name}`)
          await sleep(100)
          events.push(`exit:${name}`)
        })

      await Promise.all([hold('a'), hold('b')])

      expect(events).toHaveLength(4)
      expect(events[1]).toBe(events[0]?.replace('enter', 'exit'))
      expect(events[3]).toBe(events[2]?.replace('enter', 'exit'))
    })

    it('works for an id whose session does not exist', async () => {
      expect(await storeOf().withSessionLock('never-a-session', async () => 'held')).toBe('held')
    })

    it('releases the lock on a throwing callback and keeps what it wrote', async () => {
      const store = storeOf()
      const session = sessionOf({ id: 'throwing-callback', sub: 'account-throwing-callback' })

      await expect(
        store.withSessionLock(session.id, async () => {
          await store.saveSession(session)
          throw new Error('an unusable grant')
        }),
      ).rejects.toThrow('an unusable grant')

      // What `refreshSession` depends on when it saves the rotated tokens and then rethrows: the write committed on
      // its own connection, so releasing the lock did not take it back.
      expect((await store.getSession(session.id))?.refreshToken).toBe(session.refreshToken)
      expect(await store.withSessionLock(session.id, async () => 'held')).toBe('held')
    })
  })

  describe('saturation', () => {
    it('lets a holder persist rotated tokens while every lock connection is taken', async () => {
      const small = openHandles(url, { main: { max: 2 }, locks: { max: 2 } })
      const cas = createGatedCas()
      try {
        const store = storeOf({ deadlineMs: 10_000 }, small)
        const session = sessionOf({ id: 'saturated', sub: 'account-saturated' })
        await store.saveSession(session)

        const ctx: SessionContext = { client: cas.client, store }
        // Six callers on two lock connections: the holder's, one waiter blocked on the row, four queued in the pool.
        const callers = Array.from({ length: 6 }, () => refreshSession(ctx, session.id))
        await until(() => cas.refreshCalls.length === 1, { label: 'the holder to reach CAS' })
        await expect.poll(observer.lockWaiters).toBeGreaterThanOrEqual(1)
        expect(small.pools.locks.waitingCount).toBeGreaterThanOrEqual(1)
        cas.release()

        const sessions = await Promise.all(callers)
        expect(cas.refreshCalls).toEqual([refreshTokenFor(session.sub, 0)])
        for (const refreshed of sessions) {
          expect(refreshed.refreshToken).toBe(refreshTokenFor(session.sub, 1))
        }
        // The holder's save went through `main` while the lock pool was saturated.
        expect((await store.getSession(session.id))?.refreshToken).toBe(refreshTokenFor(session.sub, 1))
      } finally {
        cas.release()
        await small.close()
      }
    })

    it('completes more concurrent refreshes than either pool allows', async () => {
      const small = openHandles(url, { main: { max: 2 }, locks: { max: 3 } })
      const cas = createGatedCas()
      try {
        const store = storeOf({}, small)
        const subs = ['account-saturate-a', 'account-saturate-b', 'account-saturate-c']
        for (const [index, sub] of subs.entries()) {
          await store.saveSession(sessionOf({ id: `saturate-${index}`, sub }))
        }

        const ctx: SessionContext = { client: cas.client, store }
        // Twelve callers over three sessions: more than either pool, and nine of them waiting on a lock somebody else
        // holds. A holder's own `saveSession` runs on the main pool, which no waiter ever occupies, so holders can
        // finish and the queues drain.
        const callers = Array.from({ length: 12 }, (_, n) => refreshSession(ctx, `saturate-${n % 3}`))
        await until(() => cas.refreshCalls.length === 3, { label: 'one holder per session to reach CAS' })
        // Long enough for the nine waiters to have reached their session's lock before the holders are let go.
        await sleep(250)
        cas.release()

        const sessions = await Promise.all(callers)
        expect(cas.refreshCalls).toHaveLength(3)
        expect([...cas.refreshCalls].sort()).toEqual(subs.map(sub => refreshTokenFor(sub, 0)).sort())
        for (const [n, refreshed] of sessions.entries()) {
          expect(refreshed.refreshToken).toBe(refreshTokenFor(subs[n % 3] ?? '', 1))
        }
      } finally {
        cas.release()
        await small.close()
      }
    })
  })

  describe('bounded waits', () => {
    it('answers lock_timeout for a select blocked longer than lock_timeout', async () => {
      const id = 'blocked-select'
      await storeOf().withSessionLock(id, async () => undefined)
      const holder = holdLock(handles.locks, id)
      try {
        await holder.entered
        let called = false
        const taking = failureOf(
          storeOf({ lockTimeoutMs: 500, deadlineMs: 5000 }).withSessionLock(id, async () => {
            called = true
          }),
        )
        await expect.poll(observer.blockedStatements, { interval: 20 }).toEqual([expect.stringMatching(LOCK_SELECT)])

        const error = busy((await taking).error)
        expect(error.reason).toBe('lock_timeout')
        expect((error.cause as { code?: string }).code).toBe('55P03')
        expect(called).toBe(false)
      } finally {
        holder.release()
      }
      expect(await holder.done).toBe('held')
      expect(await observer.lockWaiters()).toBe(0)
      expect(await lockRows(id)).toBe(1)
      expect(await storeOf().withSessionLock(id, async () => 'held')).toBe('held')
    })

    it('answers lock_timeout for an insert blocked longer than lock_timeout', async () => {
      // No committed row: the holder's insert is uncommitted, so the second insert waits on it.
      const id = 'blocked-insert'
      const holder = holdLock(handles.locks, id)
      try {
        await holder.entered
        let called = false
        const taking = failureOf(
          storeOf({ lockTimeoutMs: 500, deadlineMs: 5000 }).withSessionLock(id, async () => {
            called = true
          }),
        )
        await expect.poll(observer.blockedStatements, { interval: 20 }).toEqual([expect.stringMatching(LOCK_INSERT)])

        const error = busy((await taking).error)
        expect(error.reason).toBe('lock_timeout')
        expect(called).toBe(false)
      } finally {
        holder.release()
      }
      expect(await holder.done).toBe('held')
      expect(await lockRows(id)).toBe(1)
      expect(await storeOf().withSessionLock(id, async () => 'held')).toBe('held')
    })

    it('retakes a row that vanished while the select waited', async () => {
      const id = 'vanished-retry'
      await storeOf().withSessionLock(id, async () => undefined)
      // The sweep's move: the holder deletes the row it holds before it commits.
      const holder = holdLock(handles.locks, id, lock => lock.deleteFrom('session_locks').where('id', '=', id).execute())
      try {
        await holder.entered
        const taking = storeOf({ deadlineMs: 5000 }).withSessionLock(id, async () => 'held')
        await expect.poll(observer.blockedStatements).toEqual([expect.stringMatching(LOCK_SELECT)])
        holder.release()
        expect(await taking).toBe('held')
      } finally {
        holder.release()
      }
      await holder.done
      expect(await lockRows(id)).toBe(1)
    })

    it('answers attempts when the row vanished on every attempt', async () => {
      const id = 'vanished-attempts'
      await storeOf().withSessionLock(id, async () => undefined)
      const holder = holdLock(handles.locks, id, lock => lock.deleteFrom('session_locks').where('id', '=', id).execute())
      let called = false
      try {
        await holder.entered
        const taking = failureOf(
          storeOf({ maxAttempts: 1, deadlineMs: 5000 }).withSessionLock(id, async () => {
            called = true
          }),
        )
        await expect.poll(observer.blockedStatements).toEqual([expect.stringMatching(LOCK_SELECT)])
        holder.release()
        expect(busy((await taking).error).reason).toBe('attempts')
      } finally {
        holder.release()
      }
      await holder.done
      expect(called).toBe(false)
      expect(await observer.lockWaiters()).toBe(0)
      expect(await storeOf().withSessionLock(id, async () => 'held')).toBe('held')
    })

    it.each([
      { name: 'the row is still there', deleteOnRelease: false },
      { name: 'the row vanished as well', deleteOnRelease: true },
    ])('answers deadline when the clock passed it while the select waited ($name)', async ({ deleteOnRelease }) => {
      const id = `clock-deadline-${String(deleteOnRelease)}`
      await storeOf().withSessionLock(id, async () => undefined)
      const holder = holdLock(
        handles.locks,
        id,
        deleteOnRelease ? lock => lock.deleteFrom('session_locks').where('id', '=', id).execute() : undefined,
      )
      const clock = createFixedClock(NOW)
      let called = false
      try {
        await holder.entered
        // The real backstop timer is 5 s away: only the clock can end this take in time.
        const taking = failureOf(
          storeOf({ clock, deadlineMs: 5000, lockTimeoutMs: 5000 }).withSessionLock(id, async () => {
            called = true
          }),
        )
        await expect.poll(observer.blockedStatements).toEqual([expect.stringMatching(LOCK_SELECT)])
        clock.advance(5001)
        const released = performance.now()
        holder.release()

        const { error } = await taking
        expect(busy(error).reason).toBe('deadline')
        expect(performance.now() - released).toBeLessThan(2000)
      } finally {
        holder.release()
      }
      await holder.done
      expect(called).toBe(false)
      // No retry and no further statement: the committed row is untouched, or gone with the holder.
      expect(await lockRows(id)).toBe(deleteOnRelease ? 0 : 1)
      expect(await observer.lockWaiters()).toBe(0)
      expect(await storeOf().withSessionLock(id, async () => 'held')).toBe('held')
    })

    it('caps lock_timeout by the budget the connection wait left', async () => {
      const single = openHandles(url, { locks: { max: 1 } })
      const blocked = 'budget-blocked'
      const occupying = 'budget-occupying'
      await storeOf().withSessionLock(blocked, async () => undefined)
      // The row the take will block on, held through another pool.
      const blocker = holdLock(handles.locks, blocked)
      // The one connection of the small pool, held on another id.
      const occupier = holdLock(single.locks, occupying)
      let called = false
      try {
        await Promise.all([blocker.entered, occupier.entered])
        const taking = failureOf(
          storeOf({ deadlineMs: 600, lockTimeoutMs: 5000 }, single).withSessionLock(blocked, async () => {
            called = true
          }),
        )
        await expect.poll(() => single.pools.locks.waitingCount).toBe(1)
        await sleep(200)
        occupier.release()

        // The take got its connection with about 400 ms left, so its select may wait that long and no longer.
        const { error, elapsed } = await taking
        expect(['lock_timeout', 'deadline']).toContain(busy(error).reason)
        expect(elapsed).toBeLessThan(2000)
        // Without the cap its backend would wait the full 5 s on the row the blocker still holds.
        await expect.poll(observer.lockWaiters, { timeout: 1500 }).toBe(0)
        expect(await observer.blockedStatements()).toEqual([])
      } finally {
        occupier.release()
        blocker.release()
      }
      await Promise.all([occupier.done, blocker.done])
      expect(called).toBe(false)
      expect(await storeOf().withSessionLock(blocked, async () => 'held')).toBe('held')
      await single.close()
    })

    it('answers within the deadline on a select blocked on the first attempt', async () => {
      const id = 'first-attempt-deadline'
      await storeOf().withSessionLock(id, async () => undefined)
      const holder = holdLock(handles.locks, id)
      let called = false
      try {
        await holder.entered
        const { error, elapsed } = await failureOf(
          storeOf({ lockTimeoutMs: 5000, deadlineMs: 300 }).withSessionLock(id, async () => {
            called = true
          }),
        )
        // The capped lock_timeout and the timer are both about 300 ms: either may answer first.
        expect(['deadline', 'lock_timeout']).toContain(busy(error).reason)
        expect(elapsed).toBeLessThan(2000)
        // The abandoned statement ended by its capped lock_timeout and rolled back while the holder still holds.
        await expect.poll(observer.lockWaiters, { timeout: 1000 }).toBe(0)
        expect(await observer.blockedStatements()).toEqual([])
        expect(await lockRows(id)).toBe(1)
      } finally {
        holder.release()
      }
      await holder.done
      expect(called).toBe(false)
      expect(await storeOf().withSessionLock(id, async () => 'held')).toBe('held')
    })

    it('answers deadline while the lock pool is saturated, without reaching Postgres', async () => {
      const single = openHandles(url, { locks: { max: 1 } })
      const occupier = holdLock(single.locks, 'other')
      let called = false
      try {
        await occupier.entered
        const taking = failureOf(
          storeOf({ deadlineMs: 300 }, single).withSessionLock('wanted', async () => {
            called = true
          }),
        )
        await expect.poll(() => single.pools.locks.waitingCount).toBe(1)
        expect(await observer.blockedStatements()).toEqual([])
        expect(await lockRows('wanted')).toBe(0)

        const { error, elapsed } = await taking
        expect(busy(error).reason).toBe('deadline')
        expect(elapsed).toBeLessThan(2000)
      } finally {
        occupier.release()
      }
      await occupier.done
      // The abandoned attempt got the connection, rolled back before inserting anything and gave it back.
      await expect.poll(() => single.pools.locks.idleCount).toBe(1)
      expect(await lockRows('wanted')).toBe(0)
      expect(called).toBe(false)
      expect(await storeOf({}, single).withSessionLock('wanted', async () => 'held')).toBe('held')
      await single.close()
    })

    it.each([{ lockTimeoutMs: 0 }, { deadlineMs: -1 }, { maxAttempts: 1.5 }, { deadlineMs: 2 ** 31 }, { lockTimeoutMs: 2 ** 31 }])(
      'refuses %o at construction',
      lock => {
        expect(() => storeOf(lock)).toThrow(Error)
      },
    )
  })

  describe('sessions and the users snapshot', () => {
    it('creates the users row on the first save and updates it in place on a later one', async () => {
      const clock = createFixedClock(NOW)
      const store = createPgSessionStore(handles, { clock })
      const sub = 'account-snapshot'

      await store.saveSession({ ...sessionOf({ id: 'snapshot-first', sub, accountType: 'guest' }), displayName: null, avatarUrl: null })
      const created = await handles.main.selectFrom('users').selectAll().where('cas_id', '=', sub).execute()
      expect(created).toEqual([expect.objectContaining({ account_type: 'guest', display_name: null, avatar_url: null })])

      // A later exchange or refresh brings changed claims: the same row moves on, it does not multiply.
      clock.advance(60_000)
      await store.saveSession({
        ...sessionOf({ id: 'snapshot-second', sub, accountType: 'full' }),
        displayName: 'Upgraded Name',
        avatarUrl: 'https://example.com/avatar.png',
      })
      const updated = await handles.main.selectFrom('users').selectAll().where('cas_id', '=', sub).execute()
      expect(updated).toEqual([
        expect.objectContaining({ account_type: 'full', display_name: 'Upgraded Name', avatar_url: 'https://example.com/avatar.png' }),
      ])
      expect(new Date(updated[0]?.created_at ?? 0).getTime()).toBe(NOW)
      expect(new Date(updated[0]?.updated_at ?? 0).getTime()).toBe(NOW + 60_000)
    })

    it('leaves a single row with the latest tokens when one id is saved twice', async () => {
      const store = storeOf()
      const sub = 'account-session-upsert'
      await store.saveSession(sessionOf({ id: 'session-upsert', sub, generation: 0 }))
      await store.saveSession(sessionOf({ id: 'session-upsert', sub, generation: 5 }))

      const rows = await handles.main.selectFrom('sessions').select('refresh_token').where('id', '=', 'session-upsert').execute()
      expect(rows).toEqual([{ refresh_token: refreshTokenFor(sub, 5) }])
    })

    it('round-trips a session with the epoch columns as numbers and the account type narrowed', async () => {
      const store = storeOf()
      const session = sessionOf({
        id: 'round-trip',
        sub: 'account-round-trip',
        accountType: 'guest',
        accessTokenExpiresAt: 1_700_000_000_123,
        grantEndsAt: 1_900_000_000_456,
        createdAt: 1_600_000_000_789,
        displayName: 'A Name',
        avatarUrl: 'https://example.com/a.png',
      })
      await store.saveSession(session)

      // `pg` hands bigints over as strings; the port speaks numbers.
      expect(await store.getSession(session.id)).toStrictEqual(session)
    })

    it('keeps an avatar URL longer than a varchar whole in both tables', async () => {
      const store = storeOf()
      // Nothing bounds the `picture` claim, so nothing may bound the column it lands in.
      const avatarUrl = `https://example.com/avatars/${'a'.repeat(400)}.png`
      const session = sessionOf({ id: 'long-avatar', sub: 'account-long-avatar', avatarUrl })
      await store.saveSession(session)

      expect((await store.getSession(session.id))?.avatarUrl).toBe(avatarUrl)
      const account = await handles.main.selectFrom('users').select('avatar_url').where('cas_id', '=', session.sub).executeTakeFirst()
      expect(account?.avatar_url).toBe(avatarUrl)
    })

    it('answers undefined for an unknown id', async () => {
      expect(await storeOf().getSession('nothing-was-ever-saved-here')).toBeUndefined()
    })

    it('deletes the session and leaves the account', async () => {
      const store = storeOf()
      const session = sessionOf({ id: 'to-delete', sub: 'account-to-delete' })
      await store.saveSession(session)

      await store.deleteSession(session.id)

      expect(await store.getSession(session.id)).toBeUndefined()
      expect(await handles.main.selectFrom('users').select('cas_id').where('cas_id', '=', session.sub).execute()).toHaveLength(1)
    })

    it('refuses an account type the CHECK on sessions does not allow', async () => {
      const row = { ...sessionOf({ id: 'admin-session', sub: 'account-admin' }) }
      await expect(
        handles.main
          .insertInto('sessions')
          .values({
            id: row.id,
            sub: row.sub,
            account_type: 'admin',
            display_name: null,
            avatar_url: null,
            refresh_token: row.refreshToken,
            access_token: row.accessToken,
            id_token: row.idToken,
            access_token_expires_at: 0,
            grant_ends_at: 0,
            grant_started_at: 0,
          })
          .execute(),
      ).rejects.toMatchObject({ code: '23514' })
      expect(await storeOf().getSession(row.id)).toBeUndefined()
    })

    it('saves the users snapshot and the session in one transaction', async () => {
      const clock = createFixedClock(NOW)
      const store = createPgSessionStore(handles, { clock })
      const before = { ...sessionOf({ id: 'sess-secret-a', sub: 'account-a' }), displayName: 'Before' }
      await store.saveSession(before)

      clock.advance(60_000)
      // A sessions-only failure (`refresh_token` is NOT NULL) after a users upsert that on its own would succeed.
      const broken = { ...sessionOf({ id: 'sess-secret-b', sub: 'account-a' }), displayName: 'After', refreshToken: null as unknown as string }
      await expect(store.saveSession(broken)).rejects.toMatchObject({ code: '23502' })

      const account = await handles.main.selectFrom('users').selectAll().where('cas_id', '=', 'account-a').executeTakeFirstOrThrow()
      expect(account.display_name).toBe('Before')
      expect(new Date(account.updated_at).getTime()).toBe(NOW)
      expect(await store.getSession('sess-secret-b')).toBeUndefined()
      expect(await store.getSession('sess-secret-a')).toStrictEqual(before)

      // The same with an account seen for the first time leaves no users row at all.
      await expect(store.saveSession({ ...broken, sub: 'account-new' })).rejects.toMatchObject({ code: '23502' })
      expect(await handles.main.selectFrom('users').select('cas_id').where('cas_id', '=', 'account-new').execute()).toEqual([])
    })
  })

  describe('pending requests', () => {
    const pendingOf = (overrides: Partial<PendingAuthorizationRequest> = {}): PendingAuthorizationRequest => ({
      state: 'a-state',
      codeVerifier: 'a-verifier',
      nonce: 'a-nonce',
      sessionId: null,
      sub: null,
      expiresAt: NOW + 5_000,
      ...overrides,
    })

    it('is consumed by the first take and gone for the second', async () => {
      const store = storeOf()
      const request = pendingOf({ sessionId: 'initiating-session', sub: 'initiating-sub' })
      await store.savePendingRequest(request)

      expect(await store.takePendingRequest(request.state)).toEqual(request)
      expect(await store.takePendingRequest(request.state)).toBeUndefined()
    })

    it('consumes an expired request and still answers undefined', async () => {
      const store = storeOf()
      const request = pendingOf({ state: 'expired-state', expiresAt: NOW })
      await store.savePendingRequest(request)

      expect(await store.takePendingRequest(request.state)).toBeUndefined()
      // Consumed, not swept: the row is gone because the take removed it.
      expect(await handles.main.selectFrom('auth_requests').select('state').where('state', '=', request.state).execute()).toEqual([])
    })

    it('answers undefined for an unknown state', async () => {
      expect(await storeOf().takePendingRequest('never-saved')).toBeUndefined()
    })

    it('keeps one row with the latest values when one state is saved twice', async () => {
      const store = storeOf()
      await store.savePendingRequest(pendingOf({ nonce: 'first-nonce' }))
      const latest = pendingOf({ nonce: 'second-nonce', sessionId: 'a-session', sub: 'account-a', expiresAt: NOW + 9_000 })
      await store.savePendingRequest(latest)

      expect(await handles.main.selectFrom('auth_requests').select('state').execute()).toHaveLength(1)
      expect(await store.takePendingRequest(latest.state)).toEqual(latest)
    })
  })
})
