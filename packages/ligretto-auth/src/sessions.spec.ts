import { describe, expect, it } from 'vitest'
import type { CasClientOptions } from './cas-client'
import { createCasClient } from './cas-client'
import type { PendingAuthorizationRequest, Session, SessionStore } from './session-store'
import { createInMemorySessionStore } from './session-store'
import type { SessionContext } from './sessions'
import { beginSignIn, completeSignIn, GRANT_LIFETIME_MS, mintGuest, PENDING_REQUEST_TTL_MS, refreshSession } from './sessions'
import type { CasStub } from './test-support/cas'
import { casStub, CLIENT_ID, CLIENT_SECRET, gate, nonceOf, POST_LOGOUT_REDIRECT_URI, REDIRECT_URI, SUB } from './test-support/cas'

const START = 1_793_000_000_000
const GUEST_SUB = 'a0a0a0a0-0000-4000-8000-00000000000a'
const OTHER_SUB = 'b0b0b0b0-0000-4000-8000-00000000000b'
const ACCESS_TOKEN_LIFETIME_MS = 600_000

const clock = (start = START) => {
  let value = start
  return { now: () => value, advance: (ms: number) => void (value += ms) }
}

const casClient = (cas: CasStub, overrides: Partial<CasClientOptions> = {}) =>
  createCasClient({
    issuer: cas.issuer,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: POST_LOGOUT_REDIRECT_URI,
    fetch: cas.fetch,
    ...overrides,
  })

/** The claims of a guest's ID token: no name, and `anon` for how it authenticated (§8). */
const guestClaims = (sub = GUEST_SUB): Record<string, unknown> => ({ sub, account_type: 'guest', amr: ['anon'], name: undefined })

/** A store that records what was asked of it, in order, so a test can assert when a write happened. */
const recording = (store: SessionStore) => {
  const calls: string[] = []
  const pendingRequests: PendingAuthorizationRequest[] = []
  const wrapped: SessionStore = {
    getSession: async id => {
      calls.push(`get ${id}`)
      return await store.getSession(id)
    },
    saveSession: async session => {
      calls.push(`save ${session.id} ${session.refreshToken}`)
      return await store.saveSession(session)
    },
    deleteSession: async id => {
      calls.push(`delete ${id}`)
      return await store.deleteSession(id)
    },
    savePendingRequest: async request => {
      pendingRequests.push(request)
      return await store.savePendingRequest(request)
    },
    takePendingRequest: async state => await store.takePendingRequest(state),
    withSessionLock: async (sessionId, fn) => {
      calls.push(`lock ${sessionId}`)
      return await store.withSessionLock(sessionId, fn)
    },
  }
  return { store: wrapped, calls, pendingRequests }
}

const sessionWith = (overrides: Partial<Session> = {}): Session => ({
  id: 'session-1',
  sub: GUEST_SUB,
  accountType: 'guest',
  displayName: null,
  avatarUrl: null,
  refreshToken: 'seed-refresh',
  accessToken: 'seed-access',
  accessTokenExpiresAt: START + ACCESS_TOKEN_LIFETIME_MS,
  grantEndsAt: START + GRANT_LIFETIME_MS,
  idToken: 'seed-id-token',
  createdAt: START,
  ...overrides,
})

/** A context over a fresh stub, store and clock, with the recording wrapper every test can read. */
const context = async (options: { keySets?: never } = {}) => {
  const cas = await casStub(options)
  const time = clock()
  const { store, calls, pendingRequests } = recording(createInMemorySessionStore({ now: time.now }))
  const ctx: SessionContext = { client: casClient(cas), store, now: time.now }
  return { cas, ctx, store, calls, pendingRequests, time }
}

/** Waits for something the code under test does on its own; the loop ends as soon as it has happened. */
const until = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 500 && !condition(); attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  if (!condition()) {
    throw new Error('The condition was never met')
  }
}

const counted = (calls: string[], call: string): number => calls.filter(seen => seen === call).length

describe('refreshSession', () => {
  it('persists the rotated refresh token before it resolves', async () => {
    const { cas, ctx, store, calls } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } })
    calls.length = 0

    const refreshed = await refreshSession(ctx, 'session-1', { force: true })
    calls.push('resolved')

    expect(calls).toEqual(['lock session-1', 'get session-1', 'save session-1 refresh-1', 'resolved'])
    expect(refreshed).toMatchObject({ refreshToken: 'refresh-1', accessToken: 'access-1' })
    await expect(store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'refresh-1' })
  })

  it('presents the rotated token on the next refresh, which is the only one CAS accepts', async () => {
    const { cas, ctx, store } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } }, { claims: { ...guestClaims(), nonce: undefined } })

    await refreshSession(ctx, 'session-1', { force: true })
    await refreshSession(ctx, 'session-1', { force: true })

    expect(cas.tokenRequests.map(request => request.form.get('refresh_token'))).toEqual(['seed-refresh', 'refresh-1'])
    await expect(store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'refresh-2' })
  })

  it('keeps the grant’s end and its creation time, and takes the snapshot the new ID token carries', async () => {
    const { cas, ctx, store, time } = await context()
    await store.saveSession(sessionWith({ accountType: 'full', displayName: 'Ada' }))
    cas.answer({ claims: { sub: GUEST_SUB, name: 'Ada Lovelace', nonce: undefined } })
    time.advance(ACCESS_TOKEN_LIFETIME_MS)

    const refreshed = await refreshSession(ctx, 'session-1')

    expect(refreshed).toMatchObject({
      displayName: 'Ada Lovelace',
      grantEndsAt: START + GRANT_LIFETIME_MS,
      createdAt: START,
      accessTokenExpiresAt: START + 2 * ACCESS_TOKEN_LIFETIME_MS,
    })
  })

  it('collapses two concurrent refreshes into one token request', async () => {
    const { cas, ctx, store } = await context()
    await store.saveSession(sessionWith({ accessTokenExpiresAt: START }))
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } })

    await Promise.all([refreshSession(ctx, 'session-1'), refreshSession(ctx, 'session-1')])

    // The second holder of the lock re-read the session and found the token the first one stored.
    expect(cas.tokenRequests).toHaveLength(1)
  })

  it('skips a token still fresh, refreshes one about to expire, and refreshes a fresh one when forced', async () => {
    const { cas, ctx, store, time } = await context()
    await store.saveSession(sessionWith())
    cas.answer(
      { claims: { ...guestClaims(), nonce: undefined } },
      { claims: { ...guestClaims(), nonce: undefined } },
      { claims: { ...guestClaims(), nonce: undefined } },
    )

    await refreshSession(ctx, 'session-1')
    expect(cas.tokenRequests).toHaveLength(0)

    await refreshSession(ctx, 'session-1', { force: true })
    expect(cas.tokenRequests).toHaveLength(1)

    time.advance(ACCESS_TOKEN_LIFETIME_MS - 60_000)
    await refreshSession(ctx, 'session-1')
    expect(cas.tokenRequests).toHaveLength(2)
  })

  it('reports an unknown session rather than signing a nobody in', async () => {
    const { ctx } = await context()

    await expect(refreshSession(ctx, 'session-1')).rejects.toMatchObject({ name: 'UnknownSessionError', code: 'unknown_session' })
  })

  it('deletes the session when the grant is over, and rethrows the typed error', async () => {
    const { cas, ctx, store } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ failure: { status: 400, error: 'invalid_grant' } })

    await expect(refreshSession(ctx, 'session-1', { force: true })).rejects.toMatchObject({ name: 'TokenEndpointError', code: 'invalid_grant' })
    await expect(store.getSession('session-1')).resolves.toBeUndefined()
  })

  it('leaves the session untouched when CAS is only away', async () => {
    const { cas, ctx, store } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ failure: { status: 503, error: 'temporarily_unavailable' } })

    await expect(refreshSession(ctx, 'session-1', { force: true })).rejects.toMatchObject({ code: 'temporarily_unavailable' })
    await expect(store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'seed-refresh' })
  })
})

describe('beginSignIn', () => {
  it('saves the pending request of a plain sign-in, with no session and no hint', async () => {
    const { cas, ctx, pendingRequests } = await context()

    const { url, state } = await beginSignIn(ctx)

    expect(cas.tokenRequests).toHaveLength(0)
    expect(new URL(url).searchParams.has('id_token_hint')).toBe(false)
    expect(pendingRequests[0]).toMatchObject({ state, sessionId: null, sub: null, expiresAt: START + PENDING_REQUEST_TTL_MS })
  })

  it('force-refreshes a guest before the upgrade and hints with the ID token that refresh issued', async () => {
    const { cas, ctx, store, pendingRequests } = await context()
    // The access token is still fresh: §9 refreshes all the same, because the hint must be unexpired.
    await store.saveSession(sessionWith())
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } })

    const { url } = await beginSignIn(ctx, { sessionId: 'session-1', scope: 'openid profile email' })

    expect(cas.tokenRequests.map(request => request.grantType)).toEqual(['refresh_token'])
    const refreshed = await store.getSession('session-1')
    expect(new URL(url).searchParams.get('id_token_hint')).toBe(refreshed?.idToken)
    expect(refreshed?.idToken).not.toBe('seed-id-token')
    expect(new URL(url).searchParams.get('scope')).toBe('openid profile email')
    expect(pendingRequests[0]).toMatchObject({ sessionId: 'session-1', sub: GUEST_SUB })
  })

  it('does not start a sign-in for a guest whose grant has already ended', async () => {
    const { cas, ctx, store, pendingRequests } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ failure: { status: 400, error: 'invalid_grant' } })

    await expect(beginSignIn(ctx, { sessionId: 'session-1' })).rejects.toMatchObject({ code: 'invalid_grant' })
    expect(pendingRequests).toEqual([])
  })
})

describe('completeSignIn', () => {
  it('redeems the code with the verifier and nonce of its own request, and creates the session', async () => {
    const { cas, ctx, store, pendingRequests } = await context()
    const { url, state } = await beginSignIn(ctx)
    cas.answer({ claims: { nonce: nonceOf(url) } })

    const { session, previousSub } = await completeSignIn(ctx, { code: 'the-code', state })

    expect(cas.tokenRequests[0]?.form.get('code_verifier')).toBe(pendingRequests[0]?.codeVerifier)
    expect(previousSub).toBeNull()
    expect(session).toMatchObject({
      sub: SUB,
      accountType: 'full',
      displayName: 'Ada',
      refreshToken: 'refresh-1',
      grantEndsAt: START + GRANT_LIFETIME_MS,
      createdAt: START,
    })
    await expect(store.getSession(session.id)).resolves.toEqual(session)
  })

  it('refuses a state it never issued, one already used and one that has expired, redeeming nothing', async () => {
    const { cas, ctx, time } = await context()
    const { url, state } = await beginSignIn(ctx)
    cas.answer({ claims: { nonce: nonceOf(url) } })

    await expect(completeSignIn(ctx, { code: 'the-code', state: 'another-state' })).rejects.toMatchObject({
      name: 'CallbackStateError',
      code: 'unknown_state',
    })
    expect(cas.tokenRequests).toEqual([])

    await completeSignIn(ctx, { code: 'the-code', state })
    await expect(completeSignIn(ctx, { code: 'the-code', state })).rejects.toMatchObject({ name: 'CallbackStateError' })

    const stale = await beginSignIn(ctx)
    time.advance(PENDING_REQUEST_TTL_MS)
    await expect(completeSignIn(ctx, { code: 'the-code', state: stale.state })).rejects.toMatchObject({ name: 'CallbackStateError' })
    expect(cas.tokenRequests).toHaveLength(1)
  })

  it('upgrades a guest in place: the session keeps its id and the grant’s 30 days start again', async () => {
    const { cas, ctx, store, time } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } })
    const { url, state } = await beginSignIn(ctx, { sessionId: 'session-1' })
    time.advance(ACCESS_TOKEN_LIFETIME_MS)
    cas.answer({ claims: { sub: GUEST_SUB, account_type: 'full', amr: ['webauthn'], name: 'Ada', nonce: nonceOf(url) } })

    const { session, previousSub } = await completeSignIn(ctx, { code: 'the-code', state })

    expect(previousSub).toBeNull()
    expect(session).toMatchObject({
      id: 'session-1',
      sub: GUEST_SUB,
      accountType: 'full',
      displayName: 'Ada',
      grantEndsAt: START + ACCESS_TOKEN_LIFETIME_MS + GRANT_LIFETIME_MS,
    })
  })

  it('reports a callback for another account instead of merging it into the guest', async () => {
    const { cas, ctx, store } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } })
    const { url, state } = await beginSignIn(ctx, { sessionId: 'session-1' })
    cas.answer({ claims: { sub: OTHER_SUB, name: 'Grace', nonce: nonceOf(url) } })

    const { session, previousSub } = await completeSignIn(ctx, { code: 'the-code', state })

    expect(previousSub).toBe(GUEST_SUB)
    expect(session.id).not.toBe('session-1')
    expect(session).toMatchObject({ sub: OTHER_SUB, accountType: 'full', displayName: 'Grace' })
    // Nothing of the guest survives here: what to do with its data is the application's decision (§9).
    await expect(store.getSession('session-1')).resolves.toBeUndefined()
  })

  it('still reports the mismatch when the guest’s session is gone by the time the callback arrives', async () => {
    const { cas, ctx, store } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } })
    const { url, state } = await beginSignIn(ctx, { sessionId: 'session-1' })
    // The guest's grant ended while the user was registering a passkey, so the refresh that found out deleted it.
    await store.deleteSession('session-1')
    cas.answer({ claims: { sub: OTHER_SUB, name: 'Grace', nonce: nonceOf(url) } })

    const { session, previousSub } = await completeSignIn(ctx, { code: 'the-code', state })

    expect(previousSub).toBe(GUEST_SUB)
    expect(session).toMatchObject({ sub: OTHER_SUB })
  })

  it('creates a fresh session, reporting nothing, when the same account comes back to a deleted session', async () => {
    const { cas, ctx, store } = await context()
    await store.saveSession(sessionWith())
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } })
    const { url, state } = await beginSignIn(ctx, { sessionId: 'session-1' })
    await store.deleteSession('session-1')
    cas.answer({ claims: { sub: GUEST_SUB, name: 'Ada', nonce: nonceOf(url) } })

    const { session, previousSub } = await completeSignIn(ctx, { code: 'the-code', state })

    expect(previousSub).toBeNull()
    expect(session.id).not.toBe('session-1')
    expect(session).toMatchObject({ sub: GUEST_SUB, accountType: 'full' })
  })
})

describe('a refresh racing the callback of an upgrade', () => {
  /** The shared opening: a guest, a sign-in begun for it, and the refresh the upgrade's hint needed. */
  const upgradeBegun = async () => {
    const started = await context()
    await started.store.saveSession(sessionWith())
    started.cas.answer({ claims: { ...guestClaims(), nonce: undefined } })
    const begun = await beginSignIn(started.ctx, { sessionId: 'session-1' })
    // Only the race itself is recorded: the hint's own force-refresh took the lock too.
    started.calls.length = 0
    return { ...started, nonce: nonceOf(begun.url), state: begun.state }
  }

  it('lets the sign-in through when the racing refresh finds the grant revoked', async () => {
    const { cas, ctx, store, calls, nonce, state } = await upgradeBegun()
    const revoked = gate()
    // CAS revoked the guest's grants when the upgrade completed, so this refresh is answered `invalid_grant` (§9).
    cas.answer({ until: revoked.promise, failure: { status: 400, error: 'invalid_grant' } })

    const refreshing = refreshSession(ctx, 'session-1', { force: true })
    // The refresh holds the lock and is waiting on CAS; only then is the callback's answer scripted, so the two
    // requests cannot take each other's.
    await until(() => cas.tokenRequests.length === 1)
    cas.answer({ claims: { sub: OTHER_SUB, name: 'Grace', nonce } })

    const completing = completeSignIn(ctx, { code: 'the-code', state })
    // The callback has exchanged its code and is queued behind the refresh on the session's lock.
    await until(() => counted(calls, 'lock session-1') === 2)

    revoked.release()
    await expect(refreshing).rejects.toMatchObject({ code: 'invalid_grant' })
    const { session, previousSub } = await completing

    expect(previousSub).toBe(GUEST_SUB)
    expect(session).toMatchObject({ sub: OTHER_SUB })
    // The lock, not luck, ordered them: the callback read the session only after the refresh had deleted it.
    expect(calls.indexOf('delete session-1')).toBeLessThan(calls.lastIndexOf('get session-1'))
    await expect(store.getSession('session-1')).resolves.toBeUndefined()
    await expect(store.getSession(session.id)).resolves.toMatchObject({ sub: OTHER_SUB })
  })

  it('does not let the revoked guest’s refresh delete the sign-in that completed behind it', async () => {
    const { cas, ctx, store, calls, nonce, state } = await upgradeBegun()
    const revoked = gate()
    cas.answer({ until: revoked.promise, failure: { status: 400, error: 'invalid_grant' } })

    const refreshing = refreshSession(ctx, 'session-1', { force: true })
    await until(() => cas.tokenRequests.length === 1)
    // The upgrade CAS just completed: the same account, now a full one.
    cas.answer({ claims: { sub: GUEST_SUB, account_type: 'full', amr: ['webauthn'], name: 'Ada', nonce } })

    const completing = completeSignIn(ctx, { code: 'the-code', state })
    await until(() => counted(calls, 'lock session-1') === 2)

    revoked.release()
    await expect(refreshing).rejects.toMatchObject({ code: 'invalid_grant' })
    const { session } = await completing

    // The session the refresh deleted is gone and stays gone; the sign-in got an id of its own and survives, which
    // is what the lock buys — writing session-1 before the delete would have lost the sign-in outright.
    expect(session.id).not.toBe('session-1')
    expect(session).toMatchObject({ sub: GUEST_SUB, accountType: 'full', displayName: 'Ada' })
    await expect(store.getSession('session-1')).resolves.toBeUndefined()
    await expect(store.getSession(session.id)).resolves.toEqual(session)
  })

  it('leaves the callback’s grant in the store when the racing refresh succeeds', async () => {
    const { cas, ctx, store, calls, nonce, state } = await upgradeBegun()
    const slow = gate()
    cas.answer({ until: slow.promise, claims: { ...guestClaims(), nonce: undefined } })

    const refreshing = refreshSession(ctx, 'session-1', { force: true })
    await until(() => cas.tokenRequests.length === 1)
    cas.answer({ claims: { sub: GUEST_SUB, account_type: 'full', amr: ['webauthn'], name: 'Ada', nonce } })

    const completing = completeSignIn(ctx, { code: 'the-code', state })
    await until(() => counted(calls, 'lock session-1') === 2)

    slow.release()
    await expect(refreshing).resolves.toMatchObject({ accountType: 'guest' })
    const { session } = await completing

    // The refresh wrote first and the callback replaced what it wrote; the delayed refresh never overwrites it.
    expect(session).toMatchObject({ id: 'session-1', accountType: 'full', displayName: 'Ada' })
    await expect(store.getSession('session-1')).resolves.toEqual(session)
  })

  it('does not resurrect a session the callback retired, when a refresh arrives after it', async () => {
    const { cas, ctx, store, nonce, state } = await upgradeBegun()
    cas.answer({ claims: { sub: OTHER_SUB, name: 'Grace', nonce } })

    const { session } = await completeSignIn(ctx, { code: 'the-code', state })

    await expect(refreshSession(ctx, 'session-1', { force: true })).rejects.toMatchObject({ name: 'UnknownSessionError' })
    await expect(store.getSession('session-1')).resolves.toBeUndefined()
    await expect(store.getSession(session.id)).resolves.toMatchObject({ sub: OTHER_SUB })
  })
})

describe('mintGuest', () => {
  it('creates and persists a guest session with no name of its own', async () => {
    const { cas, ctx, store } = await context()
    cas.answer({ claims: { ...guestClaims(), nonce: undefined } })

    const session = await mintGuest(ctx)

    expect(cas.tokenRequests[0]?.grantType).toBe('urn:memebattle:oauth:grant-type:guest')
    expect(session).toMatchObject({
      sub: GUEST_SUB,
      accountType: 'guest',
      displayName: null,
      avatarUrl: null,
      refreshToken: 'refresh-1',
      grantEndsAt: START + GRANT_LIFETIME_MS,
    })
    await expect(store.getSession(session.id)).resolves.toEqual(session)
  })

  it('passes the rate limit on as the typed error, with the delay to wait out', async () => {
    const { cas, ctx } = await context()
    cas.answer({ failure: { status: 429, error: 'rate_limit_exceeded', headers: { 'Retry-After': '60' } } })

    await expect(mintGuest(ctx)).rejects.toMatchObject({ name: 'TokenEndpointError', code: 'rate_limit_exceeded', retryAfterSeconds: 60 })
  })
})
