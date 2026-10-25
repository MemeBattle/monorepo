// The four auth routes mounted on the public app, with the database probe and the users repository on PGlite, the
// package's in-memory session store and a scripted CAS client (test/support/auth-stub.ts). What the handlers decide is
// proved in packages/ligretto-auth; here the subject is the mount, which carries their answers across intact. Ports
// the cases of the previous service's AuthController.test.ts.
import { ApiError, createInMemorySessionStore, SESSION_COOKIE_NAME, STATE_COOKIE_NAME } from '@memebattle/ligretto-auth'
import type { AuthHandlers, SessionStore } from '@memebattle/ligretto-auth'
import { AuthErrorResponseSchema, MeResponseSchema } from '@memebattle/ligretto-auth/schema'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createPgDatabaseProbe } from '../../src/adapters/pg/probe.ts'
import { createPgUsersRepository } from '../../src/adapters/pg/users-repository.ts'
import { sessionBusySchema } from '../../src/contract/auth.ts'
import { createFixedClock } from '../../src/core/ports/clock.fake.ts'
import { createRecordingLogger, type LogEntry } from '../../src/core/ports/logger.fake.ts'
import { SessionBusyError } from '../../src/core/ports/session-store.ts'
import { createPublicApp } from '../../src/http/public-app.ts'
import { APP_URL, AUTHORIZATION_URL, END_SESSION_URL, FULL_SUB, GUEST_SUB, STATE, createAuthStub, type AuthStub } from '../support/auth-stub.ts'
import { createTestDatabase } from '../support/pglite.ts'

const ORIGIN = 'http://localhost:5174'

/**
 * The `description` of the package's `unknown_state` refusal, duplicated as a literal: an expectation derived from
 * the answer itself would pin none of the package's encoding.
 */
const UNKNOWN_STATE = 'The callback does not match a sign-in this browser started.'

let database: Awaited<ReturnType<typeof createTestDatabase>>

beforeAll(async () => {
  database = await createTestDatabase()
})

afterAll(async () => {
  await database.close()
})

/** The public app over a stub, with one of its handlers replaced when a case needs an answer the package never sends. */
const compose = (stub: AuthStub, overrides: Partial<AuthHandlers> = {}): { app: ReturnType<typeof createPublicApp>; entries: LogEntry[] } => {
  const { logger, entries } = createRecordingLogger()
  const { db } = database
  const app = createPublicApp({
    logger,
    clock: createFixedClock(),
    database: createPgDatabaseProbe(db),
    corsOrigins: [ORIGIN],
    auth: { ...stub.handlers, ...overrides },
    users: createPgUsersRepository(db),
    verifyAccessToken: async () => {
      throw new Error('no route of this suite verifies an access token')
    },
  })
  return { app, entries }
}

/** The `name=value` pair a browser would send back for `name`, without the attributes. */
const cookiePairOf = (res: Response, name: string): string => {
  const cookies = res.headers.getSetCookie()
  const cookie = cookies.find(one => one.startsWith(`${name}=`))
  if (cookie === undefined) {
    throw new Error(`The answer sets no ${name} cookie; it sets ${JSON.stringify(cookies)}.`)
  }
  return cookie.split(';')[0]
}

const valueOf = (pair: string, name: string): string => pair.slice(`${name}=`.length)

const cookieNames = (res: Response): string[] => res.headers.getSetCookie().map(cookie => cookie.split('=')[0])

describe('/api/auth/* in the cookie transport', () => {
  let stub: AuthStub
  let app: ReturnType<typeof createPublicApp>
  let entries: LogEntry[]

  beforeEach(() => {
    stub = createAuthStub()
    ;({ app, entries } = compose(stub))
  })

  const get = (path: string, cookie?: string) => app.request(path, { headers: cookie === undefined ? {} : { cookie } })

  it('me with no session: a guest, and the session minted for it', async () => {
    const res = await get('/api/auth/me')
    expect(res.status).toBe(200)
    const body = MeResponseSchema.parse(await res.json())
    expect(body.user).toMatchObject({ sub: GUEST_SUB, accountType: 'guest', name: null })
    // The only way the browser ever learns the id.
    expect(cookiePairOf(res, SESSION_COOKIE_NAME)).toBeTruthy()
  })

  it('me with that session: the same account, and no new session cookie', async () => {
    const minted = await get('/api/auth/me')
    const res = await get('/api/auth/me', cookiePairOf(minted, SESSION_COOKIE_NAME))
    expect(res.status).toBe(200)
    expect(MeResponseSchema.parse(await res.json()).user.sub).toBe(GUEST_SUB)
    // Handing the id over again would put a retired session back on a browser that raced a sign-in.
    expect(cookieNames(res)).not.toContain(SESSION_COOKIE_NAME)
  })

  it('sign-in: a redirect to CAS, with the state bound to this browser', async () => {
    const res = await get('/api/auth/sign-in')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(AUTHORIZATION_URL)
    expect(cookiePairOf(res, STATE_COOKIE_NAME)).toBe(`${STATE_COOKIE_NAME}=${STATE}`)
  })

  it('callback: the session set and the state cleared, as two cookies', async () => {
    const begun = await get('/api/auth/sign-in')
    const res = await get(`/api/auth/callback?code=the-code&state=${STATE}`, cookiePairOf(begun, STATE_COOKIE_NAME))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(APP_URL)
    // Two headers, not one comma-joined value: no browser splits a folded `Set-Cookie` back correctly.
    expect(res.headers.getSetCookie()).toHaveLength(2)
    expect(cookiePairOf(res, STATE_COOKIE_NAME)).toBe(`${STATE_COOKIE_NAME}=`)
    const session = valueOf(cookiePairOf(res, SESSION_COOKIE_NAME), SESSION_COOKIE_NAME)
    expect((await stub.store.getSession(session))?.sub).toBe(FULL_SUB)
  })

  it('callback with a state this browser never started: 400, with the body intact', async () => {
    const res = await get(`/api/auth/callback?code=the-code&state=${STATE}`)
    expect(res.status).toBe(400)
    // The refusal as the package wrote it: its stable code, its compact encoding and its content type.
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.text()).toBe(JSON.stringify({ error: 'unknown_state', description: UNKNOWN_STATE }))
  })

  it('callback with no query at all: the package refuses it, no validator runs in front', async () => {
    const res = await get('/api/auth/callback')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'unknown_state', description: UNKNOWN_STATE })
  })

  it('an answer that is not JSON: the bytes the handler produced, under its own content type', async () => {
    const bytes = 'sub,name\n1,a\n'
    // Only a body `JSON.parse` would reject separates forwarding the handler's bytes from re-encoding them.
    ;({ app } = compose(stub, { me: async () => new Response(bytes, { headers: { 'content-type': 'text/csv' } }) }))
    const res = await get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv')
    expect(await res.text()).toBe(bytes)
  })

  it('me when CAS cannot be reached: 503 with a stable code, never a 500', async () => {
    stub.client.guestGrant = async () => {
      throw new ApiError(0, 'network_error', 'fetch failed')
    }
    const res = await get('/api/auth/me')
    expect(res.status).toBe(503)
    expect(AuthErrorResponseSchema.parse(await res.json()).error).toBe('cas_unavailable')
  })

  it('logout with a session: a redirect to CAS, and the session cleared', async () => {
    const minted = await get('/api/auth/me')
    const res = await get('/api/auth/logout', cookiePairOf(minted, SESSION_COOKIE_NAME))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(END_SESSION_URL)
    expect(cookiePairOf(res, SESSION_COOKIE_NAME)).toBe(`${SESSION_COOKIE_NAME}=`)
  })

  it('logout with no session: still a redirect back to the application', async () => {
    const res = await get('/api/auth/logout')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(APP_URL)
  })

  it('a handler that throws something else: the one 500', async () => {
    ;({ app } = compose(stub, {
      me: async () => {
        throw new Error('a bug')
      },
    }))
    const res = await get('/api/auth/me')
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'internal_error' })
  })

  it('carries the request id on every answer', async () => {
    const minted = await get('/api/auth/me')
    const answers = [minted, await get('/api/auth/sign-in'), await get('/api/auth/callback'), await get('/api/auth/logout')]
    for (const res of answers) {
      expect(res.headers.get('x-request-id')).toBeTruthy()
    }
  })

  it('carries CORS for an allowed origin next to the session cookie', async () => {
    const res = await app.request('/api/auth/me', { headers: { origin: ORIGIN } })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    expect(cookiePairOf(res, SESSION_COOKIE_NAME)).toBeTruthy()
  })

  it('logs nothing at error for a successful flow', async () => {
    await get('/api/auth/me')
    expect(entries.filter(entry => entry.level === 'error')).toEqual([])
  })
})

describe('a session whose lock is not granted', () => {
  it('answers me 503 session_busy, logged once and without the session id', async () => {
    const inner = createInMemorySessionStore()
    let busy = false
    const store: SessionStore = {
      ...inner,
      withSessionLock: async (sessionId, fn) => {
        if (busy) {
          throw new SessionBusyError('deadline')
        }
        return await inner.withSessionLock(sessionId, fn)
      },
    }
    const { app, entries } = compose(createAuthStub({ store }))

    const minted = await app.request('/api/auth/me')
    const session = cookiePairOf(minted, SESSION_COOKIE_NAME)
    busy = true
    const res = await app.request('/api/auth/me', { headers: { cookie: session } })

    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(sessionBusySchema.parse(await res.json()).error).toBe('session_busy')
    const errors = entries.filter(entry => entry.level === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ message: 'request_failed', fields: { status: 503, error: 'session_busy', reason: 'deadline' } })
    expect(JSON.stringify(entries)).not.toContain(valueOf(session, SESSION_COOKIE_NAME))
  })
})

describe('/api/auth/* in the bearer transport', () => {
  it('sign-in answers the URL to navigate to', async () => {
    const { app } = compose(createAuthStub({ transport: 'bearer' }))
    const res = await app.request('/api/auth/sign-in')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: AUTHORIZATION_URL })
  })

  it('callback redirects with the session id in the fragment', async () => {
    const { app } = compose(createAuthStub({ transport: 'bearer' }))
    const begun = await app.request('/api/auth/sign-in')
    const res = await app.request(`/api/auth/callback?code=the-code&state=${STATE}`, { headers: { cookie: cookiePairOf(begun, STATE_COOKIE_NAME) } })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('#session_id=')
  })
})
