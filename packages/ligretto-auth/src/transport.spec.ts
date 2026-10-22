import { describe, expect, it } from 'vitest'
import type { Session } from './session-store'
import { GRANT_LIFETIME_MS } from './sessions'
import { bearerSessionIdOf, cookiesOf, createSessionTransport, SESSION_COOKIE_GRACE_MS, SESSION_COOKIE_NAME, sessionCookieMaxAge } from './transport'

const START = 1_793_000_000_000

const sessionWith = (overrides: Partial<Session> = {}): Session => ({
  id: 'the-session-id',
  sub: 'a0a0a0a0-0000-4000-8000-00000000000a',
  accountType: 'guest',
  displayName: null,
  avatarUrl: null,
  refreshToken: 'refresh',
  accessToken: 'access',
  accessTokenExpiresAt: START + 600_000,
  grantEndsAt: START + GRANT_LIFETIME_MS,
  idToken: 'id-token',
  createdAt: START,
  ...overrides,
})

const requestWith = (headers: Record<string, string>): Request => new Request('https://ligretto.example/api/auth/me', { headers })

describe('cookiesOf', () => {
  it('reads every cookie of a header, and nothing from none', () => {
    const cookies = cookiesOf('a=1; b=2; __Host-ligretto_session=the-id')

    expect(cookies.get('a')).toBe('1')
    expect(cookies.get('b')).toBe('2')
    expect(cookies.get('__Host-ligretto_session')).toBe('the-id')
    expect(cookiesOf(null).size).toBe(0)
    expect(cookiesOf('').size).toBe(0)
  })

  it('does not take a cookie whose name merely starts with the one asked for', () => {
    const cookies = cookiesOf('__Host-ligretto_session_old=stale; __Host-ligretto_session=current')

    expect(cookies.get('__Host-ligretto_session')).toBe('current')
  })

  it('keeps a base64url value whole, padding and all, and ignores a pair that is no pair', () => {
    const cookies = cookiesOf('flag; __Host-ligretto_session=AbC-_dEf=; =nameless')

    expect(cookies.get('__Host-ligretto_session')).toBe('AbC-_dEf=')
    expect(cookies.has('flag')).toBe(false)
    expect(cookies.has('')).toBe(false)
  })
})

describe('bearerSessionIdOf', () => {
  it('accepts the scheme in any casing and hands the id back byte for byte', () => {
    for (const scheme of ['Bearer', 'bearer', 'BEARER', 'BeArEr']) {
      expect(bearerSessionIdOf(requestWith({ Authorization: `${scheme} AbC-_dEf` }))).toBe('AbC-_dEf')
    }
  })

  it('reads no session from another scheme, a bare token, an empty one, or no header at all', () => {
    expect(bearerSessionIdOf(requestWith({ Authorization: 'Basic AbC-_dEf' }))).toBeUndefined()
    expect(bearerSessionIdOf(requestWith({ Authorization: 'AbC-_dEf' }))).toBeUndefined()
    expect(bearerSessionIdOf(requestWith({ Authorization: 'Bearer ' }))).toBeUndefined()
    expect(bearerSessionIdOf(requestWith({}))).toBeUndefined()
  })
})

describe('sessionCookieMaxAge', () => {
  it('runs to the end of the grant plus the grace, and never goes negative', () => {
    const session = sessionWith()

    expect(sessionCookieMaxAge(session, START)).toBe((GRANT_LIFETIME_MS + SESSION_COOKIE_GRACE_MS) / 1000)
    // Past the grant, inside the grace: the cookie is still sent, which is what makes the `signedOut` report
    // reachable at all.
    expect(sessionCookieMaxAge(session, START + GRANT_LIFETIME_MS)).toBe(SESSION_COOKIE_GRACE_MS / 1000)
    expect(sessionCookieMaxAge(session, START + GRANT_LIFETIME_MS + SESSION_COOKIE_GRACE_MS)).toBe(0)
    expect(sessionCookieMaxAge(session, START + 2 * (GRANT_LIFETIME_MS + SESSION_COOKIE_GRACE_MS))).toBe(0)
  })
})

describe('createSessionTransport', () => {
  it('refuses a session cookie name without the __Host- prefix, in either transport', () => {
    expect(() => createSessionTransport('cookie', { cookieName: 'ligretto_session' })).toThrow(TypeError)
    expect(() => createSessionTransport('bearer', { cookieName: 'ligretto_session' })).toThrow(TypeError)
    expect(() => createSessionTransport('cookie', { cookieName: '__Host-elsewhere' })).not.toThrow()
  })

  it('cookie: carries the id in its own cookie and nowhere else', () => {
    const transport = createSessionTransport('cookie')
    const session = sessionWith()
    const headers = new Headers()
    transport.install(headers, session, START)

    expect(headers.get('Set-Cookie')).toBe(
      `${SESSION_COOKIE_NAME}=the-session-id; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${sessionCookieMaxAge(session, START)}`,
    )
    expect(transport.read(requestWith({ Cookie: `${SESSION_COOKIE_NAME}=the-session-id` }))).toBe('the-session-id')
    expect(transport.read(requestWith({ Authorization: 'Bearer the-session-id' }))).toBeUndefined()
    expect(transport.inBody(session)).toBeUndefined()
    expect(transport.handover(new URL('https://ligretto.example/'), session)).toBe('https://ligretto.example/')
  })

  it('cookie: clears its cookie with Max-Age=0 and answers a navigation with a 302', async () => {
    const transport = createSessionTransport('cookie')
    const headers = new Headers()
    transport.uninstall(headers)
    const answer = transport.navigation('https://cas.example/oidc/end_session', headers)

    expect(headers.get('Set-Cookie')).toBe(`${SESSION_COOKIE_NAME}=; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=0`)
    expect(answer.status).toBe(302)
    expect(answer.headers.get('Location')).toBe('https://cas.example/oidc/end_session')
    expect(answer.headers.get('Cache-Control')).toBe('no-store')
  })

  it('bearer: sets no cookie, carries the id in the body and in the callback’s fragment', async () => {
    const transport = createSessionTransport('bearer')
    const session = sessionWith()
    const headers = new Headers()
    transport.install(headers, session, START)
    transport.uninstall(headers)

    expect(headers.get('Set-Cookie')).toBeNull()
    expect(transport.read(requestWith({ Authorization: 'bearer the-session-id' }))).toBe('the-session-id')
    expect(transport.read(requestWith({ Cookie: `${SESSION_COOKIE_NAME}=the-session-id` }))).toBeUndefined()
    expect(transport.inBody(session)).toBe('the-session-id')

    const handover = transport.handover(new URL('https://ligretto.example/?previous_sub=x'), session)
    expect(handover).toBe('https://ligretto.example/?previous_sub=x#session_id=the-session-id')
    // The id is in the fragment and in nothing a server or a log ever sees.
    expect(new URL(handover).search).toBe('?previous_sub=x')
  })

  it('bearer: answers a navigation with the URL in a JSON body, since a fetch cannot follow one', async () => {
    const transport = createSessionTransport('bearer')
    const answer = transport.navigation('https://cas.example/oidc/authorize?client_id=ligretto', new Headers())

    expect(answer.status).toBe(200)
    expect(answer.headers.get('Location')).toBeNull()
    expect(answer.headers.get('Cache-Control')).toBe('no-store')
    await expect(answer.json()).resolves.toEqual({ url: 'https://cas.example/oidc/authorize?client_id=ligretto' })
  })
})
