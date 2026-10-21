import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { refreshSession } from '@memebattle/ligretto-auth'
import type { PendingAuthorizationRequest, SessionContext } from '@memebattle/ligretto-auth'
import { createPgSessionStore } from '#app/stores/PgSessionStore'
import { createGatedCas, refreshTokenFor, sessionOf, sleep, truncateAuthTables, until } from '../../tests/helpers/sessionStore.js'

test.group('PgSessionStore — the lock', group => {
  group.each.setup(() => truncateAuthTables(db))

  test('two concurrent refreshes of one session cost CAS a single token request', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    const session = sessionOf({ id: 'one-request', sub: 'sub-one-request' })
    await store.saveSession(session)

    const cas = createGatedCas()
    const ctx: SessionContext = { client: cas.client, store }

    const first = refreshSession(ctx, session.id)
    const second = refreshSession(ctx, session.id)

    // Held at CAS: whichever caller took the lock is inside it, and the other is queued behind the lock rather
    // than on its way to CAS.
    await until(() => cas.refreshCalls.length === 1, { label: 'the holder to reach CAS' })
    cas.release()

    const [a, b] = await Promise.all([first, second])

    assert.deepEqual(cas.refreshCalls, [refreshTokenFor(session.sub, 0)])

    // The waiter re-read the session inside the lock, found the token the holder had just stored and skipped.
    const rotated = refreshTokenFor(session.sub, 1)
    assert.equal(a.refreshToken, rotated)
    assert.equal(b.refreshToken, rotated)
    assert.equal((await store.getSession(session.id))?.refreshToken, rotated)
  })

  test('more concurrent refreshes than either pool allows all complete', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    const subs = ['saturate-a', 'saturate-b', 'saturate-c']
    for (const [index, sub] of subs.entries()) {
      await store.saveSession(sessionOf({ id: `saturate-${index}`, sub }))
    }

    const cas = createGatedCas()
    const ctx: SessionContext = { client: cas.client, store }

    // Twelve callers over three sessions: more than the main pool's five and the lock pool's ten, and nine of
    // them waiting on a lock somebody else holds. A holder's own `saveSession` runs on the main pool, which no
    // waiter ever occupies, so holders can finish and the queues drain.
    const callers = Array.from({ length: 12 }, (_, n) => refreshSession(ctx, `saturate-${n % 3}`))

    await until(() => cas.refreshCalls.length === 3, { label: 'one holder per session to reach CAS' })
    // Long enough for the nine waiters to have reached their session's lock before the holders are let go.
    await sleep(250)
    cas.release()

    const sessions = await Promise.all(callers)

    assert.lengthOf(cas.refreshCalls, 3)
    assert.deepEqual([...cas.refreshCalls].sort(), subs.map(sub => refreshTokenFor(sub, 0)).sort())
    for (const [n, session] of sessions.entries()) {
      assert.equal(session.refreshToken, refreshTokenFor(subs[n % 3], 1))
    }
  })

  test('two holders of one id never overlap', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    const events: string[] = []
    const hold = async (name: string) =>
      await store.withSessionLock('serialise', async () => {
        events.push(`enter:${name}`)
        await sleep(100)
        events.push(`exit:${name}`)
      })

    await Promise.all([hold('a'), hold('b')])

    assert.lengthOf(events, 4)
    assert.equal(events[1], events[0].replace('enter', 'exit'))
    assert.equal(events[3], events[2].replace('enter', 'exit'))
  })

  test('the lock works for an id whose session does not exist', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    assert.equal(await store.withSessionLock('never-a-session', async () => 'held'), 'held')
  })

  test('a throwing callback releases the lock and keeps what it wrote', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    const session = sessionOf({ id: 'throwing-callback', sub: 'sub-throwing-callback' })

    await assert.rejects(
      async () =>
        await store.withSessionLock(session.id, async () => {
          await store.saveSession(session)
          throw new Error('an unusable grant')
        }),
      Error,
      'an unusable grant',
    )

    // What `refreshSession` depends on where it saves the rotated tokens and then rethrows: the write committed
    // on its own connection, so releasing the lock did not take it back.
    assert.equal((await store.getSession(session.id))?.refreshToken, session.refreshToken)
    assert.equal(await store.withSessionLock(session.id, async () => 'held'), 'held')
  })
})

test.group('PgSessionStore — sessions and the users snapshot', group => {
  group.each.setup(() => truncateAuthTables(db))

  test('the first save creates the users row and a later one updates it in place', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    const sub = 'sub-snapshot'

    await store.saveSession({
      ...sessionOf({ id: 'snapshot-first', sub, accountType: 'guest' }),
      displayName: null,
      avatarUrl: null,
    })

    const created = await db.connection('pg').from('users').where('cas_id', sub)
    assert.lengthOf(created, 1)
    assert.equal(created[0].account_type, 'guest')
    assert.isNull(created[0].display_name)

    // A later exchange or refresh brings changed claims: the same row moves on, it does not multiply.
    await store.saveSession({
      ...sessionOf({ id: 'snapshot-second', sub, accountType: 'full' }),
      displayName: 'Upgraded Name',
      avatarUrl: 'https://example.com/avatar.png',
    })

    const updated = await db.connection('pg').from('users').where('cas_id', sub)
    assert.lengthOf(updated, 1)
    assert.equal(updated[0].account_type, 'full')
    assert.equal(updated[0].display_name, 'Upgraded Name')
    assert.equal(updated[0].avatar_url, 'https://example.com/avatar.png')
  })

  test('saving one session id twice leaves a single row with the latest tokens', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    const sub = 'sub-session-upsert'

    await store.saveSession(sessionOf({ id: 'session-upsert', sub, generation: 0 }))
    await store.saveSession(sessionOf({ id: 'session-upsert', sub, generation: 5 }))

    const rows = await db.connection('pg').from('sessions').where('id', 'session-upsert')
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].refresh_token, refreshTokenFor(sub, 5))
  })

  test('a session round-trips, with the epoch columns still numbers', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    const session = sessionOf({
      id: 'round-trip',
      sub: 'sub-round-trip',
      accessTokenExpiresAt: 1_700_000_000_123,
      grantEndsAt: 1_900_000_000_456,
      createdAt: 1_600_000_000_789,
      displayName: 'A Name',
      avatarUrl: 'https://example.com/a.png',
    })

    await store.saveSession(session)
    const stored = await store.getSession(session.id)

    // `pg` hands bigints over as strings; the port speaks numbers.
    assert.deepEqual(stored, session)
    assert.isNumber(stored?.accessTokenExpiresAt)
    assert.isNumber(stored?.grantEndsAt)
    assert.isNumber(stored?.createdAt)
  })

  test('an unknown id answers undefined', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    assert.isUndefined(await store.getSession('nothing-was-ever-saved-here'))
  })

  test('deleteSession removes the row', async ({ assert }) => {
    const store = createPgSessionStore({ db })
    const session = sessionOf({ id: 'to-delete', sub: 'sub-to-delete' })
    await store.saveSession(session)

    await store.deleteSession(session.id)

    assert.isUndefined(await store.getSession(session.id))
    // The account outlives its session.
    assert.lengthOf(await db.connection('pg').from('users').where('cas_id', session.sub), 1)
  })
})

test.group('PgSessionStore — pending requests', group => {
  group.each.setup(() => truncateAuthTables(db))

  const pendingOf = (overrides: Partial<PendingAuthorizationRequest> = {}): PendingAuthorizationRequest => ({
    state: 'a-state',
    codeVerifier: 'a-verifier',
    nonce: 'a-nonce',
    sessionId: null,
    sub: null,
    expiresAt: 5_000,
    ...overrides,
  })

  test('a request is consumed by the first take and gone for the second', async ({ assert }) => {
    const store = createPgSessionStore({ db, now: () => 1_000 })
    const request = pendingOf({ sessionId: 'initiating-session', sub: 'initiating-sub' })

    await store.savePendingRequest(request)

    assert.deepEqual(await store.takePendingRequest(request.state), request)
    assert.isUndefined(await store.takePendingRequest(request.state))
  })

  test('an expired request is consumed and still answered undefined', async ({ assert }) => {
    const store = createPgSessionStore({ db, now: () => 9_000 })
    const request = pendingOf({ state: 'expired-state' })

    await store.savePendingRequest(request)

    assert.isUndefined(await store.takePendingRequest(request.state))
    // Consumed, not swept: the row is gone because the take removed it.
    assert.lengthOf(await db.connection('pg').from('auth_requests').where('state', request.state), 0)
  })

  test('an unknown state answers undefined', async ({ assert }) => {
    const store = createPgSessionStore({ db, now: () => 1_000 })
    assert.isUndefined(await store.takePendingRequest('never-saved'))
  })
})
