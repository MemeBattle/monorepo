import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { SESSION_COOKIE_GRACE_MS, refreshSession } from '@memebattle/ligretto-auth'
import type { SessionContext } from '@memebattle/ligretto-auth'
import { createPgSessionStore } from '#app/stores/PgSessionStore'
import { sweepExpiredAuth } from '#app/stores/sweepExpiredAuth'
import { createGatedCas, refreshTokenFor, sessionOf, settlementOf, sleep, truncateAuthTables, until } from '../../tests/helpers/sessionStore.js'

/** Far enough along that a whole grace window still leaves positive epochs to write. */
const NOW = 10 * SESSION_COOKIE_GRACE_MS
const now = () => NOW

test.group('sweepExpiredAuth — authorization requests', group => {
  group.each.setup(() => truncateAuthTables(db))

  test('an expired request goes and a live one stays', async ({ assert }) => {
    const store = createPgSessionStore({ db, now })
    const base = { codeVerifier: 'a-verifier', nonce: 'a-nonce', sessionId: null, sub: null }

    await store.savePendingRequest({ ...base, state: 'long-expired', expiresAt: NOW - 1 })
    // `takePendingRequest` already answers this one `undefined`, so the sweep's cutoff matches it.
    await store.savePendingRequest({ ...base, state: 'expired-exactly-now', expiresAt: NOW })
    await store.savePendingRequest({ ...base, state: 'still-live', expiresAt: NOW + 1 })

    const counts = await sweepExpiredAuth({ db, now })

    assert.equal(counts.authRequests, 2)
    const left = await db.connection('pg').from('auth_requests').select('state')
    assert.deepEqual(left, [{ state: 'still-live' }])
  })
})

test.group('sweepExpiredAuth — the session retention window', group => {
  group.each.setup(() => truncateAuthTables(db))

  test('a session is kept for the whole cookie grace past its grant', async ({ assert }) => {
    const store = createPgSessionStore({ db, now })

    // The cookie outlives the grant by the grace, and within it the stale id must still find its row: the
    // refusal of that id is the only chance to report `signedOut`.
    await store.saveSession(sessionOf({ id: 'within-grace', sub: 'sub-within-grace', grantEndsAt: NOW - 1 }))
    await store.saveSession(sessionOf({ id: 'at-the-boundary', sub: 'sub-at-the-boundary', grantEndsAt: NOW - SESSION_COOKIE_GRACE_MS }))
    await store.saveSession(sessionOf({ id: 'past-the-boundary', sub: 'sub-past-the-boundary', grantEndsAt: NOW - SESSION_COOKIE_GRACE_MS - 1 }))

    const counts = await sweepExpiredAuth({ db, now })

    assert.equal(counts.sessions, 2)
    const left = await db.connection('pg').from('sessions').select('id')
    assert.deepEqual(left, [{ id: 'within-grace' }])
    // Every lock the sweep deleted under was removed in the same transaction, so no orphan is left behind.
    assert.equal(counts.sessionLocks, 0)
    assert.lengthOf(await db.connection('pg').from('session_locks'), 0)
  })

  test('the accounts outlive the sessions swept', async ({ assert }) => {
    const store = createPgSessionStore({ db, now })
    await store.saveSession(sessionOf({ id: 'swept', sub: 'sub-kept-account', grantEndsAt: NOW - SESSION_COOKIE_GRACE_MS - 1 }))

    await sweepExpiredAuth({ db, now })

    assert.lengthOf(await db.connection('pg').from('users').where('cas_id', 'sub-kept-account'), 1)
  })
})

test.group('sweepExpiredAuth — against a writer holding the lock', group => {
  group.each.setup(() => truncateAuthTables(db))

  test('the sweep waits for a refresh in flight and cannot undo its save', async ({ assert }) => {
    const store = createPgSessionStore({ db, now })
    const session = sessionOf({
      id: 'sweep-vs-refresh',
      sub: 'sub-sweep-vs-refresh',
      grantEndsAt: NOW - SESSION_COOKIE_GRACE_MS - 1,
    })
    await store.saveSession(session)

    const cas = createGatedCas()
    const ctx: SessionContext = { client: cas.client, store, now }
    const refreshing = refreshSession(ctx, session.id)
    await until(() => cas.refreshCalls.length === 1, { label: 'the refresh to reach CAS holding the lock' })

    const sweeping = sweepExpiredAuth({ db, now })
    const sweep = settlementOf(sweeping)
    try {
      await sleep(250)
      // The port holds a session against *every* other writer, cleanup included.
      assert.isFalse(sweep.settled(), 'the sweep must wait for the lock the refresh holds')
    } finally {
      // Whatever happened above, the refresh is let go: its lock would block the suite's own teardown.
      cas.release()
    }
    const refreshed = await refreshing

    // Whether the grant is over is CAS's call, and this stub granted the rotation; a refresh never moves
    // `grantEndsAt`, so the session is still past its retention and the sweep is still right to take it.
    assert.equal(refreshed.refreshToken, refreshTokenFor(session.sub, 1))
    assert.equal(refreshed.grantEndsAt, session.grantEndsAt)

    const counts = await sweeping

    assert.equal(counts.sessions, 1)
    assert.isUndefined(await store.getSession(session.id))
    // Deleted after the holder's save, not before it: nothing was left for a writer to come back to.
    assert.lengthOf(await db.connection('pg').from('session_locks').where('id', session.id), 0)
  })

  test('a session recreated while the sweep waited is kept', async ({ assert }) => {
    const store = createPgSessionStore({ db, now })
    const stale = sessionOf({ id: 'recreated', sub: 'sub-recreated', grantEndsAt: NOW - SESSION_COOKIE_GRACE_MS - 1 })
    await store.saveSession(stale)

    let entered = false
    let release = (): void => {}
    const holding = store.withSessionLock(stale.id, async () => {
      entered = true
      await new Promise<void>(resolve => {
        release = resolve
      })
      // A new grant on the same id, as a writer that decided to recreate it would leave it.
      await store.saveSession({ ...stale, grantEndsAt: NOW + SESSION_COOKIE_GRACE_MS })
    })
    await until(() => entered, { label: 'the holder to take the lock' })

    const sweeping = sweepExpiredAuth({ db, now })
    const sweep = settlementOf(sweeping)
    try {
      await sleep(250)
      assert.isFalse(sweep.settled(), 'the sweep must wait for the lock the writer holds')
    } finally {
      // Whatever happened above, the lock is let go: an open transaction would block the suite's own teardown.
      release()
      await holding
    }
    const counts = await sweeping

    // Selecting a candidate does not decide it: the cutoff is re-checked under the lock.
    assert.equal(counts.sessions, 0)
    assert.isDefined(await store.getSession(stale.id))
  })
})

test.group('sweepExpiredAuth — a candidate it cannot take', group => {
  group.each.setup(() => truncateAuthTables(db))
  group.each.teardown(async () => {
    await db.connection('pg').rawQuery('drop trigger if exists sweep_test_refuse_lock on session_locks')
    await db.connection('pg').rawQuery('drop function if exists sweep_test_refuse_lock()')
  })

  test('a session whose lock cannot be taken costs the run nothing but that session', async ({ assert }) => {
    const store = createPgSessionStore({ db, now })
    const pastTheBoundary = NOW - SESSION_COOKIE_GRACE_MS - 1
    for (const name of ['refused', 'swept-a', 'swept-b']) {
      await store.saveSession(sessionOf({ id: name, sub: `sub-${name}`, grantEndsAt: pastTheBoundary }))
    }
    await store.savePendingRequest({ state: 'expired', codeVerifier: 'a-verifier', nonce: 'a-nonce', sessionId: null, sub: null, expiresAt: NOW - 1 })

    // In production the cause is a lock held past the lock pool's 60s acquire timeout — a refresh parked on an
    // unresponsive CAS. Waiting that out would make this test a minute long, so the same failure (a throw out of
    // the lock transaction) is raised from the lock table itself, for one id only.
    await db.connection('pg').rawQuery(`
      create function sweep_test_refuse_lock() returns trigger language plpgsql as $$
      begin
        if new.id = 'refused' then
          raise exception 'the lock could not be taken';
        end if;
        return new;
      end
      $$`)
    await db
      .connection('pg')
      .rawQuery('create trigger sweep_test_refuse_lock before insert on session_locks for each row execute function sweep_test_refuse_lock()')

    const failures: string[] = []
    const counts = await sweepExpiredAuth({ db, now, onSessionFailure: id => failures.push(id) })

    // Named, so an operator reading the job's log knows which session was left rather than only that a run failed.
    assert.deepEqual(failures, ['refused'])
    assert.equal(counts.failedSessions, 1)
    // Everything else the run was there for happened, and is still reported: the counts of a run that throws
    // part-way through are lost, and the deletes it had already committed go unrecorded.
    assert.equal(counts.sessions, 2)
    assert.equal(counts.authRequests, 1)
    assert.deepEqual(await db.connection('pg').from('sessions').select('id'), [{ id: 'refused' }])
    // Nothing was left holding the lock table either: the refused attempt rolled its insert back.
    assert.lengthOf(await db.connection('pg').from('session_locks'), 0)
  })
})

test.group('sweepExpiredAuth — orphaned locks', group => {
  group.each.setup(() => truncateAuthTables(db))

  test('a lock whose session is gone goes, and one being held is left for the next run', async ({ assert }) => {
    const store = createPgSessionStore({ db, now })
    await db.connection('pg').table('session_locks').insert({ id: 'orphaned' })

    // Taken once to completion first, so the row is committed and outlives that holder. That is the only way a
    // lock row the sweep can see comes to be held: a holder that inserted its own row has not committed it yet,
    // so no other transaction can see it, let alone delete it.
    await store.withSessionLock('held-right-now', async () => undefined)

    let entered = false
    let release = (): void => {}
    const holding = store.withSessionLock('held-right-now', async () => {
      entered = true
      await new Promise<void>(resolve => {
        release = resolve
      })
    })
    await until(() => entered, { label: 'the holder to take the lock' })

    try {
      // Completes rather than parking behind the holder: the held row is skipped, not waited on.
      const counts = await sweepExpiredAuth({ db, now })

      assert.equal(counts.sessionLocks, 1)
      assert.lengthOf(await db.connection('pg').from('session_locks').where('id', 'orphaned'), 0)
      assert.lengthOf(await db.connection('pg').from('session_locks').where('id', 'held-right-now'), 1)
    } finally {
      // Whatever happened above, the lock is let go: an open transaction would block the suite's own teardown.
      release()
      await holding
    }
  })
})
