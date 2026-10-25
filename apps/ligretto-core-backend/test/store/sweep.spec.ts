// The sweep use case over its Postgres adapter, against writers holding session locks on a real server.
import { refreshSession, SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'
import type { SessionContext } from '@memebattle/ligretto-auth'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createPgAuthSweepStore } from '../../src/adapters/pg/auth-sweep-store'
import { createPgSessionStore } from '../../src/adapters/pg/session-store'
import type { SessionLockOptions } from '../../src/adapters/pg/session-store'
import { createFixedClock } from '../../src/core/ports/clock.fake'
import { createRecordingLogger } from '../../src/core/ports/logger.fake'
import { createSweepExpiredAuth } from '../../src/core/sweep'
import { disposableDatabaseUrl } from '../support/disposable-database'
import { openHandles, resetAndMigrate } from '../support/postgres'
import type { OpenHandles } from '../support/postgres'
import { createGatedCas, gate, refreshTokenFor, sessionOf, settlementOf, sleep, truncateAuthTables, until } from '../support/session-store'

const url = disposableDatabaseUrl()
/** Far enough along that a whole grace window still leaves positive epochs to write. */
const NOW = 10 * SESSION_COOKIE_GRACE_MS
const PAST_THE_BOUNDARY = NOW - SESSION_COOKIE_GRACE_MS - 1

describe('the sweep on Postgres', () => {
  let handles: OpenHandles

  const storeOf = () => createPgSessionStore(handles, { clock: createFixedClock(NOW) })
  const sweepOf = (lock: SessionLockOptions = {}) => {
    const { logger, entries } = createRecordingLogger()
    const sweep = createSweepExpiredAuth({
      store: createPgAuthSweepStore(handles, lock),
      clock: createFixedClock(NOW),
      logger,
      sessionRetentionMs: SESSION_COOKIE_GRACE_MS,
    })
    return { sweep, entries }
  }
  const ids = async (table: 'sessions' | 'session_locks') =>
    (await handles.main.selectFrom(table).select('id').orderBy('id').execute()).map(row => row.id)

  /** A writer holding `id`'s lock through the store, parked until `release()`; `then` runs inside the lock after it. */
  const holdLock = (id: string, then?: () => Promise<unknown>) => {
    const entered = gate()
    const released = gate()
    const done = storeOf().withSessionLock(id, async () => {
      entered.open()
      await released.opened
      await then?.()
    })
    return { entered: entered.opened, release: released.open, done }
  }

  beforeAll(async () => {
    await resetAndMigrate(url)
    handles = openHandles(url)
  })

  afterAll(async () => {
    await handles.close()
  })

  beforeEach(async () => {
    await truncateAuthTables(handles.main)
  })

  it('removes an expired request and keeps a live one', async () => {
    const store = storeOf()
    const base = { codeVerifier: 'a-verifier', nonce: 'a-nonce', sessionId: null, sub: null }
    await store.savePendingRequest({ ...base, state: 'long-expired', expiresAt: NOW - 1 })
    // `takePendingRequest` already answers this one `undefined`, so the sweep's cutoff matches it.
    await store.savePendingRequest({ ...base, state: 'expired-exactly-now', expiresAt: NOW })
    await store.savePendingRequest({ ...base, state: 'still-live', expiresAt: NOW + 1 })

    const counts = await sweepOf().sweep()

    expect(counts.authRequests).toBe(2)
    expect(await handles.main.selectFrom('auth_requests').select('state').execute()).toEqual([{ state: 'still-live' }])
  })

  it('keeps a session for the whole cookie grace past its grant', async () => {
    const store = storeOf()
    // The cookie outlives the grant by the grace, and within it the stale id must still find its row: the refusal of
    // that id is the only chance to report `signedOut`.
    await store.saveSession(sessionOf({ id: 'within-grace', sub: 'account-within-grace', grantEndsAt: NOW - 1 }))
    await store.saveSession(sessionOf({ id: 'at-the-boundary', sub: 'account-at-the-boundary', grantEndsAt: NOW - SESSION_COOKIE_GRACE_MS }))
    await store.saveSession(sessionOf({ id: 'past-the-boundary', sub: 'account-past-the-boundary', grantEndsAt: PAST_THE_BOUNDARY }))

    const counts = await sweepOf().sweep()

    expect(counts.sessions).toBe(2)
    expect(await ids('sessions')).toEqual(['within-grace'])
    // Every lock the sweep deleted under was removed in the same transaction, so no orphan is left behind.
    expect(counts.sessionLocks).toBe(0)
    expect(await ids('session_locks')).toEqual([])
  })

  it('leaves the accounts of the sessions it sweeps', async () => {
    await storeOf().saveSession(sessionOf({ id: 'swept', sub: 'account-kept', grantEndsAt: PAST_THE_BOUNDARY }))

    await sweepOf().sweep()

    expect(await handles.main.selectFrom('users').select('cas_id').where('cas_id', '=', 'account-kept').execute()).toHaveLength(1)
  })

  it('waits for a refresh in flight and cannot undo its save', async () => {
    const store = storeOf()
    const session = sessionOf({ id: 'sweep-vs-refresh', sub: 'account-sweep-vs-refresh', grantEndsAt: PAST_THE_BOUNDARY })
    await store.saveSession(session)

    const cas = createGatedCas()
    const ctx: SessionContext = { client: cas.client, store, now: () => NOW }
    const refreshing = refreshSession(ctx, session.id)
    await until(() => cas.refreshCalls.length === 1, { label: 'the refresh to reach CAS holding the lock' })

    const sweeping = sweepOf().sweep()
    const sweep = settlementOf(sweeping)
    try {
      await sleep(250)
      // The port holds a session against *every* other writer, cleanup included.
      expect(sweep.settled()).toBe(false)
    } finally {
      // Whatever happened above, the refresh is let go: its lock would block the suite's own teardown.
      cas.release()
    }
    const refreshed = await refreshing

    // A refresh never moves `grantEndsAt`, so the session is still past its retention and the sweep is right to take it.
    expect(refreshed.refreshToken).toBe(refreshTokenFor(session.sub, 1))
    expect(refreshed.grantEndsAt).toBe(session.grantEndsAt)

    const counts = await sweeping
    expect(counts.sessions).toBe(1)
    expect(await store.getSession(session.id)).toBeUndefined()
    // Deleted after the holder's save, not before it: nothing was left for a writer to come back to.
    expect(await ids('session_locks')).toEqual([])
  })

  it('keeps a session recreated while it waited', async () => {
    const store = storeOf()
    const stale = sessionOf({ id: 'recreated', sub: 'account-recreated', grantEndsAt: PAST_THE_BOUNDARY })
    await store.saveSession(stale)

    // A new grant on the same id, as a writer that decided to recreate it would leave it.
    const holder = holdLock(stale.id, () => store.saveSession({ ...stale, grantEndsAt: NOW + SESSION_COOKIE_GRACE_MS }))
    await holder.entered

    const sweeping = sweepOf().sweep()
    const sweep = settlementOf(sweeping)
    try {
      await sleep(250)
      expect(sweep.settled()).toBe(false)
    } finally {
      // Whatever happened above, the lock is let go: an open transaction would block the suite's own teardown.
      holder.release()
      await holder.done
    }
    const counts = await sweeping

    // Selecting a candidate does not decide it: the cutoff is re-checked under the lock.
    expect(counts.sessions).toBe(0)
    expect(await store.getSession(stale.id)).toBeDefined()
  })

  it('leaves a session whose lock it cannot take, logs its account and sweeps the rest', async () => {
    const store = storeOf()
    for (const letter of ['a', 'b', 'c']) {
      await store.saveSession(sessionOf({ id: `sess-secret-${letter}`, sub: `account-${letter}`, grantEndsAt: PAST_THE_BOUNDARY }))
    }
    await store.savePendingRequest({ state: 'expired', codeVerifier: 'a-verifier', nonce: 'a-nonce', sessionId: null, sub: null, expiresAt: NOW - 1 })
    // Committed first, so the sweep's take blocks on the select of a row the holder keeps.
    await store.withSessionLock('sess-secret-a', async () => undefined)
    const holder = holdLock('sess-secret-a')
    await holder.entered

    const { sweep, entries } = sweepOf({ lockTimeoutMs: 200 })
    try {
      const counts = await sweep()

      expect(counts).toEqual({ authRequests: 1, sessions: 2, sessionLocks: 0, failedSessions: 1 })
      expect(await ids('sessions')).toEqual(['sess-secret-a'])
      expect(await ids('session_locks')).toEqual(['sess-secret-a'])
      expect(entries).toEqual([
        {
          level: 'warn',
          message: 'sweep_session_left',
          fields: expect.objectContaining({ sub: 'account-a', code: 'session_busy' }),
        },
      ])
      // The session id is a credential: it is in no message and no field.
      const logged = JSON.stringify(entries)
      for (const letter of ['a', 'b', 'c']) {
        expect(logged).not.toContain(`sess-secret-${letter}`)
      }
      expect(logged).toContain('account-a')
    } finally {
      holder.release()
      await holder.done
    }
  })

  it('removes an orphaned lock row and skips one held right now', async () => {
    await handles.main.insertInto('session_locks').values({ id: 'orphaned' }).execute()
    // Taken once to completion first, so the row is committed and outlives that holder. That is the only way a lock
    // row the sweep can see comes to be held: a holder that inserted its own row has not committed it yet.
    await storeOf().withSessionLock('held-right-now', async () => undefined)
    const holder = holdLock('held-right-now')
    await holder.entered

    try {
      // Completes rather than parking behind the holder: the held row is skipped, not waited on.
      const counts = await sweepOf().sweep()

      expect(counts.sessionLocks).toBe(1)
      expect(await ids('session_locks')).toEqual(['held-right-now'])
    } finally {
      holder.release()
      await holder.done
    }
  })
})
