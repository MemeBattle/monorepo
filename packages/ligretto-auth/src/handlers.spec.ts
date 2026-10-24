/**
 * The handlers over HTTP: a real `Request` in, a real `Response` out, the in-memory store and the CAS stub behind
 * them, and a driver per transport that plays the browser — a cookie jar that honours `Max-Age` against the clock the
 * test drives, or a holder that reads the session id out of the `me` body and the callback's fragment and presents it
 * in an `Authorization` header. One suite runs the shared behaviour in both transports; what the two genuinely differ
 * about has a block of its own.
 */

import { describe, expect, it } from 'vitest'
import type { CasClientOptions } from './cas-client'
import { createCasClient } from './cas-client'
import type { AuthErrorResponse, MeResponse } from './contract'
import type { AuthHandlers } from './handlers'
import { createAuthHandlers } from './handlers'
import { AuthErrorResponseSchema, authRouteFragments, MeResponseSchema, NavigationResponseSchema } from './schema'
import type { PendingAuthorizationRequest, Session, SessionStore } from './session-store'
import { createInMemorySessionStore } from './session-store'
import { GRANT_LIFETIME_MS, PENDING_REQUEST_TTL_MS } from './sessions'
import type { CasStub } from './test-support/cas'
import { casStub, CLIENT_ID, CLIENT_SECRET, gate, nonceOf, POST_LOGOUT_REDIRECT_URI, REDIRECT_URI, SUB, untilAborted } from './test-support/cas'
import type { SessionTransportKind } from './transport'
import { SESSION_COOKIE_GRACE_MS, SESSION_COOKIE_NAME, sessionCookieMaxAge, STATE_COOKIE_NAME } from './transport'

const START = 1_793_000_000_000
const GUEST_SUB = 'a0a0a0a0-0000-4000-8000-00000000000a'
const OTHER_SUB = 'b0b0b0b0-0000-4000-8000-00000000000b'
const ACCESS_TOKEN_LIFETIME_MS = 600_000
const APP_URL = 'https://ligretto.example/'
const ORIGIN = 'https://ligretto.example'

const TRANSPORTS: SessionTransportKind[] = ['cookie', 'bearer']

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

const MAX_AGE_PREFIX = 'max-age='

/** The browser's cookie store, as much of it as these routes need: `Max-Age` honoured against the driven clock. */
const cookieJar = (now: () => number) => {
  const cookies = new Map<string, { value: string; expiresAt: number }>()

  const set = (name: string, value: string, maxAgeSeconds: number): void => {
    if (value === '' || maxAgeSeconds <= 0) {
      cookies.delete(name)
      return
    }
    cookies.set(name, { value, expiresAt: now() + maxAgeSeconds * 1000 })
  }

  const live = (): [string, string][] => [...cookies].filter(([, held]) => held.expiresAt > now()).map(([name, held]) => [name, held.value])

  return {
    absorb: (response: Response): void => {
      for (const raw of response.headers.getSetCookie()) {
        const [pair = '', ...attributes] = raw.split(';').map(part => part.trim())
        const separator = pair.indexOf('=')
        const maxAge = attributes.find(attribute => attribute.toLowerCase().startsWith(MAX_AGE_PREFIX))
        set(pair.slice(0, separator), pair.slice(separator + 1), Number(maxAge?.slice(MAX_AGE_PREFIX.length) ?? 0))
      }
    },
    header: (): string | undefined => {
      const pairs = live()
      return pairs.length === 0 ? undefined : pairs.map(([name, value]) => `${name}=${value}`).join('; ')
    },
    get: (name: string): string | undefined => live().find(([held]) => held === name)?.[1],
    set,
  }
}

/** The browser as this transport makes it behave: what it presents, and what it keeps from an answer. */
const driverFor = (kind: SessionTransportKind, now: () => number) => {
  const jar = cookieJar(now)
  /**
   * Every URL this browser has been sent to or told to go to: the ones the driver requested, and the ones a handler
   * produced — a `Location`, or the `url` of a `NavigationResponse`. A test proves no session id ever reached a URL
   * by filtering this, which only means anything because the handlers' own output is in it.
   */
  const urls: string[] = []
  let bearerId: string | undefined

  const request = (path: string, query: Record<string, string> = {}): Request => {
    const url = new URL(path, ORIGIN)
    for (const [name, value] of Object.entries(query)) {
      url.searchParams.set(name, value)
    }
    urls.push(url.toString())

    const headers = new Headers()
    const cookie = jar.header()
    if (cookie !== undefined) {
      headers.set('Cookie', cookie)
    }
    if (kind === 'bearer' && bearerId !== undefined) {
      headers.set('Authorization', `Bearer ${bearerId}`)
    }
    return new Request(url, { headers })
  }

  const absorb = async (response: Response): Promise<void> => {
    jar.absorb(response)

    const location = response.headers.get('Location')
    if (location !== null) {
      urls.push(location)
    }
    const body =
      response.headers.get('Content-Type')?.includes('json') === true
        ? ((await response.clone().json()) as { sessionId?: unknown; url?: unknown })
        : {}
    if (typeof body.url === 'string') {
      urls.push(body.url)
    }

    if (kind !== 'bearer') {
      return
    }
    const fragment = location === null ? '' : new URL(location).hash
    if (fragment.startsWith('#session_id=')) {
      bearerId = fragment.slice('#session_id='.length)
      return
    }
    if (typeof body.sessionId === 'string') {
      bearerId = body.sessionId
    }
  }

  return {
    request,
    absorb,
    urls,
    /** Installs a session the way this transport would have, with the cookie lifetime the handler would have given. */
    present: (session: Session, at: number): void => {
      if (kind === 'cookie') {
        jar.set(SESSION_COOKIE_NAME, session.id, sessionCookieMaxAge(session, at))
      } else {
        bearerId = session.id
      }
    },
    /** The session id the browser holds now. */
    sessionId: (): string | undefined => (kind === 'cookie' ? jar.get(SESSION_COOKIE_NAME) : bearerId),
    cookie: (name: string): string | undefined => jar.get(name),
    /** Where a `sign-in` or `logout` answer sends the browser: the `Location`, or the URL the JSON carries. */
    navigationUrl: async (response: Response): Promise<string> =>
      kind === 'cookie' ? (response.headers.get('Location') ?? '') : NavigationResponseSchema.parse(await response.clone().json()).url,
  }
}

/** A store that records what was asked of it, in order, so a test can assert when a write happened. */
const recording = (store: SessionStore) => {
  const calls: string[] = []
  const pendingRequests: PendingAuthorizationRequest[] = []
  const saves: Session[] = []
  const wrapped: SessionStore = {
    getSession: async id => {
      calls.push(`get ${id}`)
      return await store.getSession(id)
    },
    saveSession: async session => {
      calls.push(`save ${session.id}`)
      saves.push(session)
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
  return { store: wrapped, calls, pendingRequests, saves }
}

const harness = async (kind: SessionTransportKind, overrides: Partial<CasClientOptions> = {}) => {
  const cas = await casStub()
  const time = clock()
  const recorded = recording(createInMemorySessionStore({ now: time.now }))
  const handlers = createAuthHandlers({
    client: casClient(cas, overrides),
    store: recorded.store,
    transport: kind,
    appUrl: APP_URL,
    now: time.now,
  })
  const driver = driverFor(kind, time.now)
  const fragments = authRouteFragments(kind)

  /**
   * Every answer a test receives through the harness, checked against the route's fragment for this transport: its
   * status is declared, and its JSON body parses with the declared schema. The test parses; production does not.
   */
  const conforms = async (route: keyof AuthHandlers, response: Response): Promise<void> => {
    const declared = fragments[route].responses[String(response.status)]
    if (declared === undefined) {
      throw new Error(`${route} answered ${response.status} in the ${kind} transport, which its fragment does not declare`)
    }
    const schema = declared.content?.['application/json'].schema
    if (schema === undefined) {
      expect(response.body).toBeNull()
      return
    }
    schema.parse(await response.clone().json())
  }

  const send = async (route: keyof AuthHandlers, request: Request): Promise<Response> => {
    const response = await handlers[route](request)
    await conforms(route, response)
    await driver.absorb(response)
    return response
  }

  const run = async (route: keyof AuthHandlers, path: string, query: Record<string, string> = {}): Promise<Response> =>
    await send(route, driver.request(path, query))

  return {
    cas,
    time,
    driver,
    handlers,
    store: recorded.store,
    calls: recorded.calls,
    pendingRequests: recorded.pendingRequests,
    saves: recorded.saves,
    /** A session already in the store and already presented by the browser; the recorded calls start from here. */
    seed: async (overrides: Partial<Session> = {}): Promise<Session> => {
      const session = sessionWith(overrides)
      await recorded.store.saveSession(session)
      driver.present(session, time.now())
      recorded.calls.length = 0
      recorded.saves.length = 0
      return session
    },
    /** Sends a request built by hand, for a query the driver cannot express; the answer is checked and absorbed. */
    send,
    me: async (): Promise<Response> => await run('me', '/api/auth/me'),
    signIn: async (): Promise<Response> => await run('signIn', '/api/auth/sign-in'),
    callback: async (query: Record<string, string>): Promise<Response> => await run('callback', '/api/auth/callback', query),
    logout: async (): Promise<Response> => await run('logout', '/api/auth/logout'),
  }
}

type Harness = Awaited<ReturnType<typeof harness>>

/** The sign-in started, with the authorization URL and the `state` the browser now carries in its cookie. */
const signInBegun = async (h: Harness): Promise<{ url: string; state: string }> => {
  const response = await h.signIn()
  const url = await h.driver.navigationUrl(response)
  return { url, state: new URL(url).searchParams.get('state') ?? '' }
}

const meOf = async (response: Response): Promise<MeResponse> => MeResponseSchema.parse(await response.json())
const errorOf = async (response: Response): Promise<AuthErrorResponse> => AuthErrorResponseSchema.parse(await response.json())

/** The bound the timeout cases give the CAS client: short, so a stalled CAS fails the test quickly. */
const REQUEST_TIMEOUT_MS = 20

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

describe('createAuthHandlers', () => {
  it('refuses an app URL that is not absolute, at construction rather than at the end of a sign-in', async () => {
    const cas = await casStub()
    const mount = (appUrl: string) => (): unknown =>
      createAuthHandlers({ client: casClient(cas), store: createInMemorySessionStore(), transport: 'cookie', appUrl })

    // `new URL('/')` throws, and the app URL's only use is the callback's redirect, after the session is saved. Left
    // to the first request, a relative value would cost the first user to finish a sign-in an uncoded 500 and an
    // orphaned session.
    expect(mount('/')).toThrow(TypeError)
    expect(mount('/')).toThrow(/must be absolute/)
    expect(mount(APP_URL)).not.toThrow()
  })
})

describe.each(TRANSPORTS)('the %s transport', kind => {
  describe('me', () => {
    it('mints a guest for a browser that presents no session', async () => {
      const h = await harness(kind)
      h.cas.answer({ claims: guestClaims() })

      const response = await h.me()

      expect(response.status).toBe(200)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      await expect(meOf(response)).resolves.toMatchObject({
        user: { sub: GUEST_SUB, accountType: 'guest', name: null, avatarUrl: null },
        accessToken: 'access-1',
        expiresAt: START + ACCESS_TOKEN_LIFETIME_MS,
        signedOut: false,
      })
      expect(h.cas.tokenRequests[0]?.grantType).toBe('urn:memebattle:oauth:grant-type:guest')
    })

    it('answers a session whose access token is still fresh without asking CAS anything', async () => {
      const h = await harness(kind)
      await h.seed()

      const response = await h.me()

      expect(h.cas.tokenRequests).toEqual([])
      await expect(meOf(response)).resolves.toMatchObject({ accessToken: 'seed-access', expiresAt: START + ACCESS_TOKEN_LIFETIME_MS })
    })

    it('refreshes a session with less than a minute left and answers the rotated token', async () => {
      const h = await harness(kind)
      await h.seed({ accessTokenExpiresAt: START + 30_000 })
      h.cas.answer({ claims: guestClaims() })

      const response = await h.me()

      expect(h.cas.tokenRequests.map(request => request.grantType)).toEqual(['refresh_token'])
      await expect(meOf(response)).resolves.toMatchObject({ accessToken: 'access-1', expiresAt: START + ACCESS_TOKEN_LIFETIME_MS })
      await expect(h.store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'refresh-1' })
    })

    it('reports a full account whose grant has ended, and hands it a guest', async () => {
      const h = await harness(kind)
      await h.seed({ accountType: 'full', sub: SUB, displayName: 'Ada', accessTokenExpiresAt: START })
      h.cas.answer({ failure: { status: 400, error: 'invalid_grant' } }, { claims: guestClaims() })

      const response = await h.me()

      expect(response.status).toBe(200)
      await expect(meOf(response)).resolves.toMatchObject({ user: { sub: GUEST_SUB, accountType: 'guest' }, signedOut: true })
      await expect(h.store.getSession('session-1')).resolves.toBeUndefined()
    })

    it('reports nothing when it is a guest’s own grant that has ended', async () => {
      const h = await harness(kind)
      await h.seed({ accessTokenExpiresAt: START })
      h.cas.answer({ failure: { status: 400, error: 'invalid_grant' } }, { claims: guestClaims() })

      await expect(meOf(await h.me())).resolves.toMatchObject({ user: { accountType: 'guest' }, signedOut: false })
    })

    it('mints a guest for an id the store does not hold, reporting nothing', async () => {
      const h = await harness(kind)
      await h.seed()
      await h.store.deleteSession('session-1')
      h.cas.answer({ claims: guestClaims() })

      const response = await h.me()

      expect(response.status).toBe(200)
      await expect(meOf(response)).resolves.toMatchObject({ user: { accountType: 'guest' }, signedOut: false })
    })

    it('passes the rate limit on as a 429 with the delay CAS prescribed', async () => {
      const h = await harness(kind)
      h.cas.answer({ failure: { status: 429, error: 'rate_limit_exceeded', headers: { 'Retry-After': '60' } } })

      const response = await h.me()

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('60')
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'rate_limit_exceeded' })
      expect(h.saves).toEqual([])
    })

    it('answers 503 and leaves the session alone when CAS is away for the refresh', async () => {
      const h = await harness(kind)
      await h.seed({ accessTokenExpiresAt: START })
      h.cas.answer({ failure: { status: 503, error: 'temporarily_unavailable' } })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'temporarily_unavailable' })
      await expect(h.store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'seed-refresh' })
    })

    it('tells a refusal of this client apart from CAS being away, and stores no session for it', async () => {
      const h = await harness(kind)
      h.cas.answer({ failure: { status: 401, error: 'unauthorized_client' } })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_rejected', casError: 'unauthorized_client' })
      expect(h.saves).toEqual([])
    })

    it('stores no guest session whose ID token it had to refuse', async () => {
      const h = await harness(kind)
      h.cas.answer({ signWith: h.cas.otherKey, claims: guestClaims() })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'invalid_signature' })
      expect(h.saves).toEqual([])
    })

    it('keeps the session when CAS refuses this client on the refresh', async () => {
      const h = await harness(kind)
      await h.seed({ accessTokenExpiresAt: START })
      h.cas.answer({ failure: { status: 401, error: 'invalid_client' } })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_rejected', casError: 'invalid_client' })
      await expect(h.store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'seed-refresh' })
    })

    it('answers 503 for a proxy’s page in CAS’s place on the guest mint, storing nothing', async () => {
      const h = await harness(kind)
      h.cas.answer({ raw: { status: 502, body: '<html>Bad gateway</html>', headers: { 'Content-Type': 'text/html' } } })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'unknown' })
      expect(h.saves).toEqual([])
    })

    it('answers 503 for a proxy’s page in CAS’s place on the refresh, keeping the session', async () => {
      const h = await harness(kind)
      await h.seed({ accessTokenExpiresAt: START })
      h.cas.answer({ raw: { status: 502, body: '<html>Bad gateway</html>', headers: { 'Content-Type': 'text/html' } } })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'unknown' })
      await expect(h.store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'seed-refresh' })
    })

    it('answers 503 when the token endpoint cannot be reached, though the document was read', async () => {
      const cas = await casStub()
      // Discovery succeeds and the token endpoint refuses the connection. One outage answers the same wherever it
      // strikes: a coded 503, not a 500 because this one came back as `fetch`'s own rejection.
      const unreachable: typeof globalThis.fetch = async (input, init) =>
        String(input) === cas.document.token_endpoint ? Promise.reject(new TypeError('fetch failed')) : await cas.fetch(input, init)
      const h = await harness(kind, { fetch: unreachable })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'unreachable' })
      expect(h.saves).toEqual([])
    })

    it('hands no session back on an answer for a session the browser already presented', async () => {
      const h = await harness(kind)
      const seeded = await h.seed()

      const response = await h.me()

      // Restamping would buy nothing — the cookie's `Max-Age` counts to `grantEndsAt` plus the grace however often
      // it is written, and the bearer caller is holding the id it presented.
      expect(response.headers.getSetCookie()).toEqual([])
      await expect(meOf(response).then(body => body.sessionId)).resolves.toBeUndefined()
      expect(h.driver.sessionId()).toBe(seeded.id)
    })

    it('does not put a retired session back on the browser when a me answer arrives after the callback', async () => {
      const h = await harness(kind)
      await h.seed()
      h.cas.answer({ claims: guestClaims() })
      const { url, state } = await signInBegun(h)
      h.cas.answer({ claims: { sub: GUEST_SUB, account_type: 'full', amr: ['webauthn'], name: 'Ada', nonce: nonceOf(url) } })

      // A refresh timer in another tab asked `me` about the session that started the sign-in; its answer is produced
      // now and delivered later. Nothing orders HTTP responses, so the browser can see it after the callback's.
      const inFlight = await h.handlers.me(h.driver.request('/api/auth/me'))

      await h.callback({ state, code: 'the-code' })
      const signedIn = h.driver.sessionId() ?? ''

      await h.driver.absorb(inFlight)

      // The stale answer named an id the callback has retired: reinstating it would have left the next `me` minting
      // a guest and silently discarding a sign-in that completed.
      expect(h.driver.sessionId()).toBe(signedIn)
      await expect(meOf(await h.me())).resolves.toMatchObject({ user: { sub: GUEST_SUB, accountType: 'full', name: 'Ada' } })
    })

    it('answers 503 when the guest grant outlives the request timeout, storing nothing', async () => {
      const h = await harness(kind, { requestTimeoutMs: REQUEST_TIMEOUT_MS })
      h.cas.answer({ until: gate().promise, claims: guestClaims() })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'unreachable' })
      expect(h.saves).toEqual([])
    })

    it('releases the session’s lock when the refresh outlives the request timeout, keeping the session', async () => {
      const h = await harness(kind, { requestTimeoutMs: REQUEST_TIMEOUT_MS })
      await h.seed({ accessTokenExpiresAt: START })
      h.cas.answer({ until: gate().promise, claims: guestClaims() })

      const timedOut = await h.me()

      expect(timedOut.status).toBe(503)
      await expect(errorOf(timedOut)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'unreachable' })
      await expect(h.store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'seed-refresh' })

      // The in-memory lock chains promises: had the timed-out refresh kept it, this call would hang until vitest's
      // own timeout instead of taking it again.
      h.cas.answer({ claims: guestClaims() })
      const retried = await h.me()

      expect(retried.status).toBe(200)
      await expect(meOf(retried)).resolves.toMatchObject({ accessToken: 'access-1' })
      expect(counted(h.calls, 'lock session-1')).toBe(2)
    })

    it('answers 503 when the refresh’s body never finishes arriving, persisting nothing of it', async () => {
      const h = await harness(kind, { requestTimeoutMs: REQUEST_TIMEOUT_MS })
      await h.seed({ accessTokenExpiresAt: START })
      h.cas.answer({ stalledBody: true })

      const response = await h.me()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'unreachable' })
      await expect(h.store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'seed-refresh' })
      expect(h.saves).toEqual([])
    })

    it('answers 503 when the discovery document outlives the request timeout, keeping the session', async () => {
      const cas = await casStub()
      const stalled: typeof globalThis.fetch = async (input, init) =>
        String(input).endsWith('/.well-known/openid-configuration') ? await untilAborted(init?.signal) : await cas.fetch(input, init)
      const h = await harness(kind, { requestTimeoutMs: REQUEST_TIMEOUT_MS, fetch: stalled })
      await h.seed({ accessTokenExpiresAt: START })

      const response = await h.me()

      // The timeout reaches the answer through the discovery cache's own wrapper, as any unreadable metadata does.
      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'discovery_unavailable' })
      await expect(h.store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'seed-refresh' })
    })
  })

  describe('sign-in', () => {
    it('sends a browser with no session to CAS with PKCE and no hint, and binds the state to it', async () => {
      const h = await harness(kind)

      const { url, state } = await signInBegun(h)
      const query = new URL(url).searchParams

      expect(url.startsWith(`${h.cas.document.authorization_endpoint}?`)).toBe(true)
      expect(query.get('client_id')).toBe(CLIENT_ID)
      expect(query.get('code_challenge_method')).toBe('S256')
      expect(query.get('code_challenge')).toMatch(/^[\w-]{43}$/)
      expect(query.has('id_token_hint')).toBe(false)
      expect(h.cas.tokenRequests).toEqual([])
      expect(h.pendingRequests[0]).toMatchObject({ state, sessionId: null, sub: null, expiresAt: START + PENDING_REQUEST_TTL_MS })
      expect(h.driver.cookie(STATE_COOKIE_NAME)).toBe(state)
    })

    it('force-refreshes a guest and hints with the ID token that refresh issued', async () => {
      const h = await harness(kind)
      await h.seed()
      h.cas.answer({ claims: guestClaims() })

      const { url } = await signInBegun(h)

      // The access token was still fresh, and §9 refreshes all the same: CAS checks the hint's `exp` strictly.
      expect(h.cas.tokenRequests.map(request => request.grantType)).toEqual(['refresh_token'])
      const refreshed = await h.store.getSession('session-1')
      expect(new URL(url).searchParams.get('id_token_hint')).toBe(refreshed?.idToken)
      expect(refreshed?.idToken).not.toBe('seed-id-token')
      expect(h.pendingRequests[0]).toMatchObject({ sessionId: 'session-1', sub: GUEST_SUB })
    })

    it('sends no hint for a full account, but still retires what it signed in from', async () => {
      const h = await harness(kind)
      await h.seed({ accountType: 'full', sub: SUB, displayName: 'Ada' })

      const { url } = await signInBegun(h)

      // CAS ignores a hint naming a full account (§9), so it is left off; the force-refresh and the snapshot stay,
      // which is what retires the old session and reports a `sub` switch at the callback.
      expect(new URL(url).searchParams.has('id_token_hint')).toBe(false)
      expect(h.cas.tokenRequests.map(request => request.grantType)).toEqual(['refresh_token'])
      expect(h.pendingRequests[0]).toMatchObject({ sessionId: 'session-1', sub: SUB })
    })

    it('falls back to a plain sign-in when the grant ended between me and the click', async () => {
      const h = await harness(kind)
      await h.seed()
      h.cas.answer({ failure: { status: 400, error: 'invalid_grant' } })

      const { url } = await signInBegun(h)

      expect(new URL(url).searchParams.has('id_token_hint')).toBe(false)
      expect(h.pendingRequests).toHaveLength(1)
      expect(h.pendingRequests[0]).toMatchObject({ sessionId: null, sub: null })
      await expect(h.store.getSession('session-1')).resolves.toBeUndefined()
    })

    it('reports a refusal of this client on the force-refresh, and CAS being replaced by a proxy, separately', async () => {
      const refused = await harness(kind)
      await refused.seed()
      refused.cas.answer({ failure: { status: 401, error: 'invalid_client' } })

      const refusedResponse = await refused.signIn()
      expect(refusedResponse.status).toBe(503)
      await expect(errorOf(refusedResponse)).resolves.toMatchObject({ error: 'cas_rejected', casError: 'invalid_client' })

      const away = await harness(kind)
      await away.seed()
      away.cas.answer({ raw: { status: 502, body: '<html>Bad gateway</html>' } })

      const awayResponse = await away.signIn()
      expect(awayResponse.status).toBe(503)
      await expect(errorOf(awayResponse)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'unknown' })
    })
  })

  describe('callback', () => {
    it('redeems the code, replaces the session it started from, and sends the browser to the app', async () => {
      const h = await harness(kind)
      await h.seed()
      h.cas.answer({ claims: guestClaims() })
      const { url, state } = await signInBegun(h)
      // The upgrade of this very account: the `sub` survives it, and the account is a full one afterwards (§8).
      h.cas.answer({ claims: { sub: GUEST_SUB, account_type: 'full', amr: ['webauthn'], name: 'Ada', nonce: nonceOf(url) } })

      const response = await h.callback({ state, code: 'the-code' })
      const location = response.headers.get('Location') ?? ''

      expect(response.status).toBe(302)
      expect(location.startsWith(APP_URL)).toBe(true)
      expect(new URL(location).searchParams.has('previous_sub')).toBe(false)
      // The id the guest was reached by is retired with it (ADR 0015 on session fixation).
      await expect(h.store.getSession('session-1')).resolves.toBeUndefined()
      const installed = h.driver.sessionId() ?? ''
      expect(installed).not.toBe('session-1')
      await expect(h.store.getSession(installed)).resolves.toMatchObject({ sub: GUEST_SUB, accountType: 'full', displayName: 'Ada' })
      // The sign-in is over, so the browser binding goes with it.
      expect(h.driver.cookie(STATE_COOKIE_NAME)).toBeUndefined()
    })

    it('refuses a callback this browser did not start, exchanging nothing', async () => {
      const h = await harness(kind)
      const { state } = await signInBegun(h)

      const mismatched = await h.callback({ state: 'another-state', code: 'the-code' })
      expect(mismatched.status).toBe(400)
      await expect(errorOf(mismatched)).resolves.toMatchObject({ error: 'unknown_state' })

      // The same state, from a browser that holds no state cookie of its own.
      const stranger = await harness(kind)
      const strange = await stranger.callback({ state, code: 'the-code' })
      expect(strange.status).toBe(400)
      await expect(errorOf(strange)).resolves.toMatchObject({ error: 'unknown_state' })

      expect(h.cas.tokenRequests).toEqual([])
      expect(stranger.cas.tokenRequests).toEqual([])
    })

    it('refuses a state whose sign-in this backend no longer holds', async () => {
      const h = await harness(kind)
      const { state } = await signInBegun(h)
      // Consumed by a callback that already completed, or swept after its TTL.
      await h.store.takePendingRequest(state)

      const response = await h.callback({ state, code: 'the-code' })

      expect(response.status).toBe(400)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'unknown_state' })
      expect(h.cas.tokenRequests).toEqual([])
    })

    it('refuses a callback carrying no code without spending the sign-in it names', async () => {
      const h = await harness(kind)
      const { url, state } = await signInBegun(h)

      for (const code of [undefined, '']) {
        const response = await h.callback(code === undefined ? { state } : { state, code })
        expect(response.status).toBe(400)
        await expect(errorOf(response)).resolves.toMatchObject({ error: 'sign_in_failed' })
      }
      expect(h.cas.tokenRequests).toEqual([])

      // `completeSignIn` consumes the pending request before it redeems the code, so a malformed callback must not
      // reach it: the sign-in this browser has in flight still completes.
      h.cas.answer({ claims: { nonce: nonceOf(url) } })
      const completed = await h.callback({ state, code: 'the-code' })

      expect(completed.status).toBe(302)
      await expect(h.store.getSession(h.driver.sessionId() ?? '')).resolves.toMatchObject({ sub: SUB })
    })

    it('sorts an error from the authorization endpoint into away, a refusal of this client, and a sign-in that failed', async () => {
      const h = await harness(kind)
      const { state } = await signInBegun(h)

      const away = await h.callback({ state, error: 'temporarily_unavailable' })
      expect(away.status).toBe(503)
      await expect(errorOf(away)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'temporarily_unavailable' })

      // A scope this client is not registered for is a configuration fault: every sign-in fails until an operator
      // acts, and reporting it as `sign_in_failed` would make it indistinguishable from users cancelling. §4.1.2.1
      // sends the same family through the authorization endpoint as §5.2 does through the token endpoint.
      const refused = await h.callback({ state, error: 'invalid_scope', error_description: 'the scope is not registered' })
      expect(refused.status).toBe(503)
      await expect(errorOf(refused)).resolves.toMatchObject({
        error: 'cas_rejected',
        casError: 'invalid_scope',
        description: 'the scope is not registered',
      })

      const cancelled = await h.callback({ state, error: 'access_denied' })
      expect(cancelled.status).toBe(400)
      await expect(errorOf(cancelled)).resolves.toMatchObject({ error: 'sign_in_failed', casError: 'access_denied' })

      expect(h.cas.tokenRequests).toEqual([])
    })

    it('refuses a callback that carries a code but no state, keeping the sign-in this browser has in flight', async () => {
      const h = await harness(kind)
      const { state } = await signInBegun(h)

      const response = await h.callback({ code: 'the-code' })

      expect(response.status).toBe(400)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'unknown_state' })
      expect(h.driver.cookie(STATE_COOKIE_NAME)).toBe(state)
      expect(h.cas.tokenRequests).toEqual([])
    })

    it('sorts an error CAS sent back with a parameter this package does not read', async () => {
      const h = await harness(kind)
      const { state } = await signInBegun(h)

      // RFC 9207's `iss` rides along with the error: it is ignored, never a reason to refuse the callback.
      const response = await h.callback({ state, error: 'access_denied', iss: h.cas.issuer })

      expect(response.status).toBe(400)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'sign_in_failed', casError: 'access_denied' })
      expect(h.cas.tokenRequests).toEqual([])
    })

    it('reads the first value of a repeated state, as the query parser always has', async () => {
      const h = await harness(kind)
      const { url, state } = await signInBegun(h)
      h.cas.answer({ claims: { nonce: nonceOf(url) } })

      const base = h.driver.request('/api/auth/callback', { state, code: 'the-code' })
      const repeated = new URL(base.url)
      repeated.searchParams.append('state', 'another-state')
      const response = await h.send('callback', new Request(repeated, { headers: base.headers }))

      expect(response.status).toBe(302)
      await expect(h.store.getSession(h.driver.sessionId() ?? '')).resolves.toMatchObject({ sub: SUB })
    })

    it('reports a callback for another account instead of merging it into the guest', async () => {
      const h = await harness(kind)
      await h.seed()
      h.cas.answer({ claims: guestClaims() })
      const { url, state } = await signInBegun(h)
      h.cas.answer({ claims: { sub: OTHER_SUB, name: 'Grace', nonce: nonceOf(url) } })

      const response = await h.callback({ state, code: 'the-code' })
      const location = response.headers.get('Location') ?? ''

      expect(new URL(location).searchParams.get('previous_sub')).toBe(GUEST_SUB)
      await expect(h.store.getSession('session-1')).resolves.toBeUndefined()
      await expect(h.store.getSession(h.driver.sessionId() ?? '')).resolves.toMatchObject({ sub: OTHER_SUB, displayName: 'Grace' })
    })

    it('answers a spent code as a failed sign-in, not as CAS being away', async () => {
      const h = await harness(kind)
      const { state } = await signInBegun(h)
      h.cas.answer({ failure: { status: 400, error: 'invalid_grant' } })

      const response = await h.callback({ state, code: 'the-code' })

      expect(response.status).toBe(400)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'sign_in_failed', casError: 'invalid_grant' })
    })

    it('answers 503 when a proxy’s page comes back from the exchange', async () => {
      const h = await harness(kind)
      const { state } = await signInBegun(h)
      h.cas.answer({ raw: { status: 502, body: '<html>Bad gateway</html>' } })

      const response = await h.callback({ state, code: 'the-code' })

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'unknown' })
    })

    it('leaves the session it started from usable when the sign-in is abandoned', async () => {
      const h = await harness(kind)
      const seeded = await h.seed()
      h.cas.answer({ claims: guestClaims() })
      await signInBegun(h)

      // The user closed the CAS tab: no callback ever arrives, and `me` still answers from the session that began it.
      const response = await h.me()

      expect(response.status).toBe(200)
      await expect(meOf(response)).resolves.toMatchObject({ user: { sub: GUEST_SUB, accountType: 'guest' }, accessToken: 'access-1' })
      await expect(h.store.getSession('session-1')).resolves.toBeDefined()
      // The credential is still live, so it must never have been written into a URL — not a query, not a path.
      expect(h.driver.urls.filter(url => url.includes(seeded.id))).toEqual([])
    })
  })

  describe('logout', () => {
    it('ends this application’s session, then sends the browser to end CAS’s own', async () => {
      const h = await harness(kind)
      await h.seed()

      const response = await h.logout()
      const url = new URL(await h.driver.navigationUrl(response))

      expect(`${url.origin}${url.pathname}`).toBe(h.cas.document.end_session_endpoint)
      expect(url.searchParams.get('id_token_hint')).toBe('seed-id-token')
      expect(url.searchParams.get('post_logout_redirect_uri')).toBe(POST_LOGOUT_REDIRECT_URI)
      await expect(h.store.getSession('session-1')).resolves.toBeUndefined()
      // Nothing of the session is left on the browser. The bearer transport never put a cookie there to begin with;
      // the frontend drops the id it was holding once it has followed this navigation.
      expect(h.driver.cookie(SESSION_COOKIE_NAME)).toBeUndefined()
    })

    it('sends a browser with nothing to end back to the app', async () => {
      const h = await harness(kind)

      await expect(h.driver.navigationUrl(await h.logout())).resolves.toBe(APP_URL)

      // And an id the store does not hold is the same thing: there is nothing to end, and CAS is not asked.
      const stale = await harness(kind)
      await stale.seed()
      await stale.store.deleteSession('session-1')

      await expect(stale.driver.navigationUrl(await stale.logout())).resolves.toBe(APP_URL)
    })

    it('takes the state cookie back, so a sign-in left in flight cannot undo the logout', async () => {
      const h = await harness(kind)
      await h.seed()
      h.cas.answer({ claims: guestClaims() })
      const { url, state } = await signInBegun(h)

      await h.logout()

      expect(h.driver.cookie(STATE_COOKIE_NAME)).toBeUndefined()

      // The user finishes the passkey prompt in the CAS tab they had left open. Without the cookie the callback
      // fails the browser-binding check of §4, so the logout stands instead of being undone by a new session.
      h.cas.answer({ claims: { nonce: nonceOf(url) } })
      const response = await h.callback({ state, code: 'the-code' })

      expect(response.status).toBe(400)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'unknown_state' })
      // Only the sign-in's own force-refresh reached CAS: no code was exchanged and no session written.
      expect(h.cas.tokenRequests.map(request => request.grantType)).toEqual(['refresh_token'])
      expect(h.saves.filter(session => session.id !== 'session-1')).toEqual([])
    })

    it('keeps the session when CAS’s metadata cannot be read, so the user can retry a full logout', async () => {
      const cas = await casStub()
      const unreachable: typeof globalThis.fetch = async (input, init) =>
        String(input).endsWith('/.well-known/openid-configuration')
          ? Promise.reject(new Error('the discovery document is unreachable'))
          : await cas.fetch(input, init)
      const h = await harness(kind, { fetch: unreachable })
      await h.seed()

      const response = await h.logout()

      expect(response.status).toBe(503)
      await expect(errorOf(response)).resolves.toMatchObject({ error: 'cas_unavailable', casError: 'discovery_unavailable' })
      await expect(h.store.getSession('session-1')).resolves.toMatchObject({ refreshToken: 'seed-refresh' })
    })

    it('does not let a refresh waiting on CAS resurrect the session it deleted', async () => {
      const h = await harness(kind)
      await h.seed({ accessTokenExpiresAt: START })
      const held = gate()
      h.cas.answer({ until: held.promise, claims: guestClaims() })

      const refreshing = h.handlers.me(h.driver.request('/api/auth/me'))
      // The refresh holds the session's lock and is waiting on CAS; the logout queues behind it on the same lock.
      await until(() => h.cas.tokenRequests.length === 1)
      const loggingOut = h.handlers.logout(h.driver.request('/api/auth/logout'))
      await until(() => counted(h.calls, 'lock session-1') === 2)

      held.release()
      const [refreshed, loggedOut] = await Promise.all([refreshing, loggingOut])

      expect(refreshed.status).toBe(200)
      // The refresh's save landed first and the logout's lock-held delete removed it; CAS's logout revokes no grant,
      // so a row written back after the delete would have been a working session.
      expect(h.calls.indexOf('save session-1')).toBeLessThan(h.calls.indexOf('delete session-1'))
      await expect(h.store.getSession('session-1')).resolves.toBeUndefined()

      // And the hint is the ID token read under that lock — the refreshed one, not the stale seed.
      const rotated = h.saves.at(-1)?.idToken
      expect(rotated).not.toBe('seed-id-token')
      const url = new URL(await h.driver.navigationUrl(loggedOut))
      expect(url.searchParams.get('id_token_hint')).toBe(rotated)
    })
  })
})

describe('the cookie transport', () => {
  it('writes the session cookie host-only, unreadable by script, and outliving the grant by the grace', async () => {
    const h = await harness('cookie')
    h.cas.answer({ claims: guestClaims() })

    const response = await h.me()
    const session = await h.store.getSession((await meOf(response)).sessionId ?? h.driver.sessionId() ?? '')

    const seconds = (GRANT_LIFETIME_MS + SESSION_COOKIE_GRACE_MS) / 1000
    expect(response.headers.getSetCookie()).toEqual([
      `${SESSION_COOKIE_NAME}=${session?.id}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${seconds}`,
    ])
  })

  it('still presents a cookie past the grant, so the user is told they were signed out', async () => {
    const h = await harness('cookie')
    await h.seed({ accountType: 'full', sub: SUB, displayName: 'Ada' })
    h.cas.answer({ failure: { status: 400, error: 'invalid_grant' } }, { claims: guestClaims() })

    h.time.advance(GRANT_LIFETIME_MS + 24 * 60 * 60 * 1000)
    const response = await h.me()

    expect(h.cas.tokenRequests.map(request => request.grantType)).toEqual(['refresh_token', 'urn:memebattle:oauth:grant-type:guest'])
    await expect(meOf(response)).resolves.toMatchObject({ user: { accountType: 'guest' }, signedOut: true })
  })

  it('presents nothing once the grace is over, and the user is a plain new visitor', async () => {
    const h = await harness('cookie')
    await h.seed({ accountType: 'full', sub: SUB, displayName: 'Ada' })
    h.cas.answer({ claims: guestClaims() })

    h.time.advance(GRANT_LIFETIME_MS + SESSION_COOKIE_GRACE_MS + 1)
    const response = await h.me()

    // No id was presented, so nothing was refused and there is nothing to report.
    expect(h.cas.tokenRequests.map(request => request.grantType)).toEqual(['urn:memebattle:oauth:grant-type:guest'])
    await expect(meOf(response)).resolves.toMatchObject({ user: { accountType: 'guest' }, signedOut: false })
  })

  it('sends the browser to CAS itself, with the state cookie bounded by the pending request’s TTL', async () => {
    const h = await harness('cookie')

    const response = await h.signIn()

    expect(response.status).toBe(302)
    expect(response.headers.getSetCookie()).toEqual([
      `${STATE_COOKIE_NAME}=${h.driver.cookie(STATE_COOKIE_NAME)}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${PENDING_REQUEST_TTL_MS / 1000}`,
    ])
  })
})

describe('the bearer transport', () => {
  it('hands a session it minted back in the body and sets no session cookie', async () => {
    const h = await harness('bearer')
    h.cas.answer({ claims: guestClaims() })

    const response = await h.me()
    const body = await meOf(response)

    expect(body.sessionId).toBeTypeOf('string')
    await expect(h.store.getSession(body.sessionId ?? '')).resolves.toMatchObject({ sub: GUEST_SUB })
    expect(response.headers.getSetCookie()).toEqual([])
  })

  it('reads the session id from the Authorization header whatever the scheme’s casing', async () => {
    for (const scheme of ['Bearer', 'bearer', 'BeArEr']) {
      const h = await harness('bearer')
      const seeded = await h.seed()

      const response = await h.handlers.me(new Request(`${ORIGIN}/api/auth/me`, { headers: { Authorization: `${scheme} ${seeded.id}` } }))
      const body = await meOf(response)

      // The id is read, and nothing is handed back: the caller presented it, so it already holds it.
      expect(body).toMatchObject({ accessToken: 'seed-access' })
      expect(body.sessionId).toBeUndefined()
      expect(h.cas.tokenRequests).toEqual([])
    }
  })

  it('reads no session from another scheme or from a cookie, and mints a guest instead', async () => {
    const h = await harness('bearer')
    const seeded = await h.seed()
    h.cas.answer({ claims: guestClaims() }, { claims: guestClaims() })

    const presentations: Record<string, string>[] = [{ Authorization: `Basic ${seeded.id}` }, { Cookie: `${SESSION_COOKIE_NAME}=${seeded.id}` }]
    for (const headers of presentations) {
      const response = await h.handlers.me(new Request(`${ORIGIN}/api/auth/me`, { headers }))

      const body = await meOf(response)
      expect(body.sessionId).not.toBe(seeded.id)
      expect(body.signedOut).toBe(false)
    }
  })

  it('answers sign-in and logout with the URL to navigate to, since a navigation cannot carry the header', async () => {
    const h = await harness('bearer')
    await h.seed()
    h.cas.answer({ claims: guestClaims() })

    const signInResponse = await h.signIn()
    expect(signInResponse.status).toBe(200)
    expect(signInResponse.headers.get('Location')).toBeNull()
    await expect(h.driver.navigationUrl(signInResponse)).resolves.toContain('/oidc/authorize?')

    const logoutResponse = await h.logout()
    expect(logoutResponse.status).toBe(200)
    await expect(h.driver.navigationUrl(logoutResponse)).resolves.toContain('/oidc/end_session?')
  })

  it('hands a new session id over in the callback’s fragment and nowhere a server would see it', async () => {
    const h = await harness('bearer')
    await h.seed()
    h.cas.answer({ claims: guestClaims() })
    const { url, state } = await signInBegun(h)
    h.cas.answer({ claims: { sub: OTHER_SUB, name: 'Grace', nonce: nonceOf(url) } })

    const response = await h.callback({ state, code: 'the-code' })
    const location = response.headers.get('Location') ?? ''
    const installed = h.driver.sessionId() ?? ''

    expect(response.status).toBe(302)
    expect(location).toBe(`${APP_URL}?previous_sub=${GUEST_SUB}#session_id=${installed}`)
    // Everything before the fragment is what reaches a server and a log: the id is in none of it.
    expect(location.split('#')[0]).not.toContain(installed)
    await expect(h.store.getSession(installed)).resolves.toMatchObject({ sub: OTHER_SUB })
  })
})
