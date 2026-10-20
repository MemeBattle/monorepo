/**
 * The user's browser toward CAS: the TypeScript counterpart of `apps/cas/tests/reference_client/browser.rs`, for the
 * steps a relying party never performs — following a redirect to CAS, holding CAS's session cookie, and running the
 * passkey ceremonies over CAS's own `/api`.
 *
 * The paths under `/api` are the only ones the suite hard-codes: here the test plays cas-frontend, which knows them,
 * not the relying party, which takes every endpoint from the discovery document.
 */

import { parseSetCookie } from './cookies'
import { createSoftPasskey } from './soft-passkey'
import type { CreationOptions, RequestOptions, SoftPasskey } from './soft-passkey'

/**
 * Where cas-frontend is served: the WebAuthn origin, the origin the fetch-metadata line under `/api` admits, and the
 * origin of CAS's own sign-in and create-account screens. The native server's default (`apps/cas/src/config/native.rs`).
 */
export const FRONTEND_ORIGIN = 'http://localhost:5173'

/** What a navigation answered: the status and, for a redirect, where to — resolved against the URL visited. */
export interface Visited {
  status: number
  location: URL | undefined
}

/** The `Location` of a navigation that must have been a `302`, which every hop of these flows is. */
export const redirectOf = (visited: Visited): URL => {
  if (visited.status !== 302 || visited.location === undefined) {
    throw new Error(`Expected a 302 with a Location; got ${visited.status}${visited.location === undefined ? '' : ` to ${visited.location}`}.`)
  }
  return visited.location
}

export interface CasUser {
  /** A top-level navigation to `url`. */
  visit(url: string | URL): Promise<Visited>
  /**
   * The registration ceremony as cas-frontend runs it. Without a session it creates an account; under the upgrade
   * session `/oidc/authorize` opened for a guest's hint it upgrades that guest instead (ADR 0015 (e)). Either way the
   * answer carries the new session's cookie.
   */
  createAccount(displayName: string): Promise<void>
  /** The login ceremony: an assertion from this authenticator's passkey, which installs a **full** CAS session. */
  signIn(): Promise<void>
  /**
   * Whether CAS answers the cookie the browser holds at all, as cas-frontend asks it.
   *
   * An upgrade session answers too (ADR 0018), so this says "CAS knows this cookie", not "a full account is signed
   * in": a step that must know a ceremony promoted the session asks `accountType` instead.
   */
  isSignedIn(): Promise<boolean>
  /** What `/api/me` says the account behind the cookie is, or `undefined` when CAS refuses the cookie. */
  accountType(): Promise<'guest' | 'full' | undefined>
  /** Whether the browser holds a cookie from CAS at all. */
  holdsCookie(): boolean
  /**
   * The cookie the browser holds, as `name=value`, for keeping one aside before an answer takes it back; a step that
   * does that cannot proceed without one, so this fails rather than returning nothing.
   */
  heldCookie(): string
  /**
   * Puts a cookie back, for presenting one an answer took away: a browser logged out elsewhere still holds its
   * session cookie, and whether CAS still honours it is a question only the cookie can ask.
   */
  present(cookie: string): void
  /**
   * What cas-frontend does after a ceremony: CAS sent the browser to `screen` with `return_to`, and the frontend
   * navigates back to that URL on CAS. The redirect is checked to be the screen expected before it is followed.
   */
  followReturnTo(location: URL, screen: string): Promise<Visited>
}

/** The `return_to` of a redirect to the frontend's `screen`, after checking that it is one. */
const returnToOf = (location: URL, screen: string): string => {
  if (location.origin !== FRONTEND_ORIGIN) {
    throw new Error(`${location} is not on the frontend origin ${FRONTEND_ORIGIN}.`)
  }
  if (location.pathname !== screen) {
    throw new Error(`${location} is not the ${screen} screen.`)
  }
  const returnTo = location.searchParams.get('return_to')
  if (returnTo === null) {
    throw new Error(`${location} carries no return_to.`)
  }
  return returnTo
}

/** One user's browser, with one software authenticator behind it. */
export const createCasUser = (issuer: string, passkey: SoftPasskey = createSoftPasskey()): CasUser => {
  /** The one cookie CAS sets, as `name=value`. Its name is whatever CAS sent: a browser does not know it in advance. */
  let cookie: string | undefined

  const send = async (method: string, url: string | URL, body?: unknown): Promise<Response> => {
    const headers = new Headers()
    if (cookie !== undefined) {
      headers.set('cookie', cookie)
    }
    if (body !== undefined) {
      // The fetch-metadata line under `/api` admits the frontend's origin, and nothing else.
      headers.set('origin', FRONTEND_ORIGIN)
      headers.set('content-type', 'application/json')
    }
    const response = await fetch(url, { method, headers, redirect: 'manual', body: body === undefined ? undefined : JSON.stringify(body) })
    for (const header of response.headers.getSetCookie()) {
      // One cookie is all CAS sets, so the jar is that one value rather than a map: whatever the last answer said.
      const set = parseSetCookie(header)
      if (set === undefined) {
        continue
      }
      cookie = set.removed ? undefined : `${set.name}=${set.value}`
    }
    return response
  }

  /** A call of cas-frontend to CAS's `/api`, with its body parsed; a refusal is thrown with what CAS said. */
  const api = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const response = await send(method, new URL(`/api/${path}`, issuer), body)
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`${method} /api/${path} answered ${response.status}: ${text}`)
    }
    return text === '' ? undefined : JSON.parse(text)
  }

  const visit = async (url: string | URL): Promise<Visited> => {
    const target = new URL(url)
    const response = await send('GET', target)
    const location = response.headers.get('location')
    return { status: response.status, location: location === null ? undefined : new URL(location, target) }
  }

  const createAccount = async (displayName: string): Promise<void> => {
    const options = (await api('POST', 'webauthn/register-options', { displayName })) as { registrationId: string; ccr: CreationOptions }
    const answer = await passkey.register(options.ccr, FRONTEND_ORIGIN)
    await api('POST', 'webauthn/verify-registration', { registrationId: options.registrationId, response: answer })
  }

  const signIn = async (): Promise<void> => {
    const options = (await api('POST', 'webauthn/login-options')) as { loginId: string; rcr: RequestOptions }
    const answer = await passkey.assert(options.rcr, FRONTEND_ORIGIN)
    await api('POST', 'webauthn/verify-login', { loginId: options.loginId, response: answer })
  }

  /** `GET /api/me` as cas-frontend asks it: the account CAS resolved the cookie to, or `undefined` for a `401`. */
  const whoAmI = async (): Promise<{ accountType: 'guest' | 'full' } | undefined> => {
    const response = await send('GET', new URL('/api/me', issuer))
    const text = await response.text()
    if (response.status === 401) {
      return undefined
    }
    if (response.status !== 200) {
      throw new Error(`GET /api/me answered ${response.status}: ${text}`)
    }
    return JSON.parse(text) as { accountType: 'guest' | 'full' }
  }

  return {
    visit,
    createAccount,
    signIn,
    isSignedIn: async () => (await whoAmI()) !== undefined,
    accountType: async () => (await whoAmI())?.accountType,
    holdsCookie: () => cookie !== undefined,
    heldCookie: () => {
      if (cookie === undefined) {
        throw new Error('The browser holds no cookie from CAS.')
      }
      return cookie
    },
    present: given => void (cookie = given),
    followReturnTo: async (location, screen) => await visit(new URL(returnToOf(location, screen), issuer)),
  }
}
