/**
 * The package's reference run, against a real CAS.
 *
 * Nothing is stubbed: CAS is the built binary on its dev database, the client is the one `seed.sh` registered, the
 * handlers are served over a real local socket, and the sign-in ceremonies are performed with a software passkey
 * against CAS's own `/api` — the shape `apps/cas/tests/reference_client` proves CAS with from the Rust side, and
 * `apps/cas-frontend/e2e` from the browser's.
 *
 * Each test is one sequential story, as the Rust reference tests are, and each creates its own accounts, sessions and
 * store: the CI database is shared, so no test may depend on another's rows, and the passkey ceremonies are scoped by
 * each authenticator's own credentials.
 *
 * See the README for how to bring a CAS up and run this.
 */

import { describe, expect, it } from 'vitest'
import { InvalidTokenError, SESSION_COOKIE_NAME, STATE_COOKIE_NAME, TokenEndpointError, verifyAccessToken } from '../../src/index'
import type { MeResponse } from '../../src/index'
import { documentOf, ISSUER as STUB_ISSUER } from '../../src/test-support/cas'
import { APP_URL, CLIENT_ID, forceExpiry, issuer, startApp, storedSession } from './app'
import type { Browser } from './app'
import { createCasUser, redirectOf } from './cas-user'
import { createSoftPasskey } from './soft-passkey'

const CAS = issuer()

/** What a promise rejected with, so the refusal can be judged by its class and its code rather than by a message. */
const refused = async (promise: Promise<unknown>): Promise<unknown> =>
  await promise.then(
    () => {
      throw new Error('The call was expected to be refused, and resolved.')
    },
    failure => failure,
  )

/** The `me` answer, with the status checked: every scenario expects a `200`, a refusal is a failure with its body. */
const me = async (browser: Browser): Promise<MeResponse> => {
  const response = await browser.visit('/auth/me')
  const body = await response.text()
  expect(response.status, `GET /auth/me answered ${response.status}: ${body}`).toBe(200)
  return JSON.parse(body) as MeResponse
}

/** The session id the application's cookie jar holds, which is the handle a test reads the stored session by. */
const sessionId = (browser: Browser): string => {
  const id = browser.cookie(SESSION_COOKIE_NAME)
  if (id === undefined) {
    throw new Error(`The browser holds no ${SESSION_COOKIE_NAME} cookie.`)
  }
  return id
}

/** `sign-in`, as the browser navigates to it: the `302` to CAS, with the state cookie now in the jar. */
const beginSignIn = async (browser: Browser): Promise<URL> => {
  const response = await browser.visit('/auth/sign-in')
  const location = response.headers.get('location')
  expect(response.status, `GET /auth/sign-in answered ${response.status}`).toBe(302)
  expect(location, 'the sign-in redirects to CAS').not.toBeNull()
  expect(browser.cookie(STATE_COOKIE_NAME), 'the sign-in installs the state cookie').toBeDefined()
  return new URL(location ?? '')
}

describe('ligretto-auth against a real CAS', () => {
  it('serves the discovery document the package was written against', async () => {
    const response = await fetch(`${CAS}/.well-known/openid-configuration`)
    expect(response.status).toBe(200)
    const served = (await response.json()) as Record<string, unknown>

    // The stub's document with the real issuer substituted in: the members are then compared whole, so a member CAS
    // adds, drops or renames — or a value it changes — fails here, which is this suite's tripwire for a CAS that has
    // drifted from the document `src/test-support/cas.ts` lets the unit suite assume.
    const expected = JSON.parse(JSON.stringify(documentOf(STUB_ISSUER, `${STUB_ISSUER}/oidc/jwks.json`)).replaceAll(STUB_ISSUER, CAS)) as Record<
      string,
      unknown
    >
    expect(served).toEqual(expected)
  })

  it('mints a guest, rotates its grant, and revokes it on a replayed refresh token', async () => {
    const app = await startApp()
    try {
      // Scenario 1: nothing is presented, so a guest is minted and installed.
      const guest = await me(app.browser)
      expect(guest.user.accountType).toBe('guest')
      expect(guest.signedOut).toBe(false)
      expect(guest.accessToken).toBeTruthy()
      const id = sessionId(app.browser)

      // Scenario 7: the resource-server check accepts the minted access token, and the `typ` check is what refuses
      // the ID token of the very same grant — one key signs both.
      const claims = await verifyAccessToken(guest.accessToken, { issuer: CAS, audience: CLIENT_ID })
      expect(claims.sub).toBe(guest.user.sub)
      expect(claims.account_type).toBe('guest')
      expect(claims.client_id).toBe(CLIENT_ID)
      const stored = await storedSession(app.store, id)
      const wrongTyp = await refused(verifyAccessToken(stored.idToken, { issuer: CAS, audience: CLIENT_ID }))
      expect(wrongTyp).toBeInstanceOf(InvalidTokenError)
      expect(wrongTyp).toMatchObject({ code: 'wrong_typ' })

      // Scenario 2: the access token is stamped expired, so the next `me` refreshes, and the refresh rotates.
      await forceExpiry(app.store, id)
      const refreshed = await me(app.browser)
      expect(refreshed.user.sub).toBe(guest.user.sub)
      expect(refreshed.accessToken).not.toBe(guest.accessToken)
      const rotated = await storedSession(app.store, id)
      expect(rotated.refreshToken).not.toBe(stored.refreshToken)

      // Scenario 3: the token the rotation retired is presented again. CAS reads a reuse as theft and revokes the
      // whole grant (ADR 0012 (b)), so the session's own refresh token dies with it.
      const replay = await refused(app.client.refresh(stored.refreshToken))
      expect(replay).toBeInstanceOf(TokenEndpointError)
      expect(replay).toMatchObject({ code: 'invalid_grant' })

      await forceExpiry(app.store, id)
      const fresh = await me(app.browser)
      expect(fresh.user.accountType).toBe('guest')
      expect(fresh.user.sub).not.toBe(guest.user.sub)
      // What ended was a guest, so there is nothing the user was signed out of.
      expect(fresh.signedOut).toBe(false)
      expect(sessionId(app.browser)).not.toBe(id)
    } finally {
      await app.close()
    }
  })

  it('upgrades a guest, replaces the session on a sign-in to another account, and logs both sides out', async () => {
    // One authenticator across both application contexts: the account registered in the upgrade is the account the
    // replacement signs in to, which is the point of that scenario.
    const passkey = createSoftPasskey()
    const first = await startApp()
    const second = await startApp()
    try {
      // (a) The upgrade keeps `sub`.
      const user = createCasUser(CAS, passkey)
      const guest = await me(first.browser)
      expect(guest.user.accountType).toBe('guest')
      const guestSessionId = sessionId(first.browser)

      const authorize = await beginSignIn(first.browser)
      expect(authorize.origin).toBe(new URL(CAS).origin)
      expect(authorize.searchParams.get('id_token_hint'), 'a guest session hints with its ID token').toBeTruthy()

      // A valid guest hint with no full CAS session opens an upgrade session and sends the browser to the
      // create-account screen — never to `/sign-in` (`apps/cas/src/oidc/http/authorize.rs`).
      const screen = redirectOf(await user.visit(authorize))
      expect(screen.pathname).toBe('/create-account')
      expect(user.holdsCookie(), 'CAS opened an upgrade session for the hinted guest').toBe(true)

      await user.createAccount('Ada')
      const callback = redirectOf(await user.followReturnTo(screen, '/create-account'))
      expect(callback.origin).toBe(new URL(APP_URL).origin)
      expect(callback.pathname).toBe('/auth/callback')

      const installed = await first.browser.deliver(callback.toString())
      expect(installed.status).toBe(302)
      const back = new URL(installed.headers.get('location') ?? '')
      expect(back.origin).toBe(new URL(APP_URL).origin)
      // The account was upgraded, so the `sub` the sign-in started from is the one that came back.
      expect(back.searchParams.get('previous_sub')).toBeNull()
      const firstSessionId = sessionId(first.browser)
      expect(firstSessionId, 'a completed sign-in always installs a new session id').not.toBe(guestSessionId)
      expect(first.browser.cookie(STATE_COOKIE_NAME), 'the callback takes the state cookie back').toBeUndefined()

      const upgraded = await me(first.browser)
      expect(upgraded.user.accountType).toBe('full')
      expect(upgraded.user.sub, 'an upgrade keeps the account id (ADR 0015)').toBe(guest.user.sub)
      expect(upgraded.user.name).toBe('Ada')

      // (b) A sign-in to an existing account replaces the session and reports the `sub` that was left behind.
      const other = createCasUser(CAS, passkey)
      const secondGuest = await me(second.browser)
      expect(secondGuest.user.accountType).toBe('guest')
      expect(secondGuest.user.sub).not.toBe(upgraded.user.sub)
      const secondGuestSessionId = sessionId(second.browser)

      const secondAuthorize = await beginSignIn(second.browser)
      const secondScreen = redirectOf(await other.visit(secondAuthorize))
      // A fresh CAS jar holds no full session, so this hinted guest lands on create-account too.
      expect(secondScreen.pathname).toBe('/create-account')

      // Instead of registering: the login ceremony with Ada's passkey, which installs a **full** CAS session — what a
      // user parked on create-account does when they already have an account.
      await other.signIn()
      expect(await other.isSignedIn()).toBe(true)
      // The `return_to` CAS handed out carries no hint, so at authorize the full session wins and a code is issued.
      const secondCallback = redirectOf(await other.followReturnTo(secondScreen, '/create-account'))
      expect(secondCallback.pathname).toBe('/auth/callback')

      const replaced = await second.browser.deliver(secondCallback.toString())
      expect(replaced.status).toBe(302)
      const replacedBack = new URL(replaced.headers.get('location') ?? '')
      expect(replacedBack.searchParams.get('previous_sub'), 'the sign-in came back as another account').toBe(secondGuest.user.sub)
      const secondSessionId = sessionId(second.browser)
      expect(secondSessionId).not.toBe(secondGuestSessionId)

      const signedIn = await me(second.browser)
      expect(signedIn.user.accountType).toBe('full')
      expect(signedIn.user.sub).toBe(upgraded.user.sub)
      // The session the sign-in started from is gone; an id the store does not hold reports nothing.
      expect(await second.store.getSession(secondGuestSessionId)).toBeUndefined()

      // (c) A full account's grant revoked under a live session is what `signedOut: true` reports.
      const live = await storedSession(first.store, firstSessionId)
      // Spent out of band: CAS rotates, and the copy the store still holds is retired.
      await first.client.refresh(live.refreshToken)
      await forceExpiry(first.store, firstSessionId)
      const after = await me(first.browser)
      expect(after.user.accountType).toBe('guest')
      expect(after.user.sub).not.toBe(upgraded.user.sub)
      expect(after.signedOut, 'the row the refresh read named a full account').toBe(true)

      // (d) Logout ends both sides.
      const loggedOut = await second.browser.visit('/auth/logout')
      expect(loggedOut.status).toBe(302)
      const endSession = new URL(loggedOut.headers.get('location') ?? '')
      expect(endSession.origin).toBe(new URL(CAS).origin)
      expect(endSession.searchParams.get('id_token_hint')).toBeTruthy()
      expect(endSession.searchParams.get('post_logout_redirect_uri')).toBe(APP_URL)
      expect(await second.store.getSession(secondSessionId), 'logout deletes the application session').toBeUndefined()
      expect(second.browser.cookie(SESSION_COOKIE_NAME), 'logout takes the session cookie off the browser').toBeUndefined()

      const home = redirectOf(await other.visit(endSession))
      expect(home.toString()).toBe(APP_URL)
      expect(await other.isSignedIn(), "end_session was reached and ended CAS's own session").toBe(false)

      // A stale copy of the logged-out id — another tab, another device, a cookie the `Set-Cookie` never reached:
      // presenting it mints a guest and reports nothing, because the row it would be refused against is gone
      // (`handlers.spec.ts` pins that for an id the store does not hold).
      second.browser.present(SESSION_COOKIE_NAME, secondSessionId)
      const visitor = await me(second.browser)
      expect(visitor.user.accountType).toBe('guest')
      expect(visitor.signedOut).toBe(false)
      expect(sessionId(second.browser)).not.toBe(secondSessionId)
    } finally {
      await second.close()
      await first.close()
    }
  })
})
