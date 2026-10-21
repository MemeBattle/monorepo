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
    // Every lock the sweep took to delete under was removed in the same transaction, leaving no orphans behind.
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

    // The cutoff is re-checked under the lock, so what the sweep selected is not what it acts on.
    assert.equal(counts.sessions, 0)
    assert.isDefined(await store.getSession(stale.id))
  })
})

test.group('sweepExpiredAuth — orphaned locks', group => {
  group.each.setup(() => truncateAuthTables(db))

  test('a lock whose session is gone goes, and one being held is left for the next run', async ({ assert }) => {
    const store = createPgSessionStore({ db, now })
    await db.connection('pg').table('session_locks').insert({ id: 'orphaned' })

    // Taken once to completion first, so the row is committed and outlives that holder — which is the only way
    // a lock row the sweep can actually see comes to be held: a holder that inserted its own row has not
    // committed it yet, so no other transaction can see it, let alone delete it.
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
