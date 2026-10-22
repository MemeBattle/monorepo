/**
 * That the four routes are mounted where they belong, and that `#helpers/webHandler` carries the package's answers
 * across without losing anything. What the handlers *decide* is proved in `packages/ligretto-auth`, against a fake
 * CAS; here the CAS client is a scripted object (`tests/helpers/authStub.ts`) and the subject is the seam.
 */

import { test } from '@japa/runner'
import type { ApiResponse } from '@japa/api-client'
import { ApiError, SESSION_COOKIE_NAME, STATE_COOKIE_NAME } from '@memebattle/ligretto-auth'
import type { AuthStub } from '../../../tests/helpers/authStub.js'
import { APP_URL, AUTHORIZATION_URL, END_SESSION_URL, FULL_SUB, GUEST_SUB, STATE, bindAuthHandlers } from '../../../tests/helpers/authStub.js'

/**
 * The `Set-Cookie` values of an answer, one string per header.
 *
 * Typed as a single string by `@japa/api-client`, while Node's client hands repeated headers over as a list — which
 * is exactly what the adapter has to preserve, so the list is the case that matters here.
 */
const setCookiesOf = (response: ApiResponse): string[] => {
  const header = response.headers()['set-cookie'] as string | string[] | undefined
  return header === undefined ? [] : Array.isArray(header) ? header : [header]
}

/** The `name=value` pair a browser would send back for `name`, without the attributes. */
const cookiePairOf = (response: ApiResponse, name: string): string => {
  const cookies = setCookiesOf(response)
  const cookie = cookies.find(one => one.startsWith(`${name}=`))
  if (cookie === undefined) {
    throw new Error(`The answer sets no ${name} cookie; it sets ${JSON.stringify(cookies)}.`)
  }
  return cookie.split(';')[0]
}

const valueOf = (pair: string, name: string): string => pair.slice(`${name}=`.length)

/**
 * The `description` of the package's `unknown_state` refusal, copied here on purpose: the case below compares the
 * answer's bytes with it, which only pins the adapter's Buffer path as long as the expectation is a literal rather
 * than something derived from the answer itself.
 */
const UNKNOWN_STATE = 'The callback does not match a sign-in this browser started.'

test.group('/api/auth/*', group => {
  let stub: AuthStub

  group.each.setup(() => {
    stub = bindAuthHandlers()
  })

  test('me with no session — a guest, handed the session that was minted for it', async ({ client, assert }) => {
    const response = await client.get('/api/auth/me')

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.user.sub, GUEST_SUB)
    assert.equal(body.user.accountType, 'guest')
    assert.isNull(body.user.name)
    // The only way the browser ever learns the id.
    assert.exists(cookiePairOf(response, SESSION_COOKIE_NAME))
  })

  test('me presenting that session — the same account, and no second handover', async ({ client, assert }) => {
    const minted = await client.get('/api/auth/me')
    const session = cookiePairOf(minted, SESSION_COOKIE_NAME)

    const response = await client.get('/api/auth/me').header('cookie', session)

    response.assertStatus(200)
    assert.equal(response.body().user.sub, GUEST_SUB)
    // Handing the id over again would put a retired session back on a browser that raced a sign-in.
    assert.notInclude(
      setCookiesOf(response).map(cookie => cookie.split('=')[0]),
      SESSION_COOKIE_NAME,
    )
  })

  test('sign-in — a redirect to CAS, with the state bound to this browser', async ({ client, assert }) => {
    const response = await client.get('/api/auth/sign-in').redirects(0)

    response.assertStatus(302)
    assert.equal(response.header('location'), AUTHORIZATION_URL)
    assert.equal(cookiePairOf(response, STATE_COOKIE_NAME), `${STATE_COOKIE_NAME}=${STATE}`)
  })

  test('callback — the session installed and the state taken back, as two cookies', async ({ client, assert }) => {
    const begun = await client.get('/api/auth/sign-in').redirects(0)

    const response = await client
      .get('/api/auth/callback')
      .qs({ code: 'the-code', state: STATE })
      .header('cookie', cookiePairOf(begun, STATE_COOKIE_NAME))
      .redirects(0)

    response.assertStatus(302)
    assert.equal(response.header('location'), APP_URL)
    // Two headers, not one comma-joined value: no browser splits a folded `Set-Cookie` back correctly, so this is
    // the case the adapter exists for.
    assert.lengthOf(setCookiesOf(response), 2)
    assert.equal(cookiePairOf(response, STATE_COOKIE_NAME), `${STATE_COOKIE_NAME}=`)

    const session = valueOf(cookiePairOf(response, SESSION_COOKIE_NAME), SESSION_COOKIE_NAME)
    assert.equal((await stub.store.getSession(session))?.sub, FULL_SUB)
  })

  test('callback with a state this browser never started — 400, with the body intact', async ({ client, assert }) => {
    const response = await client.get('/api/auth/callback').qs({ code: 'the-code', state: STATE }).redirects(0)

    response.assertStatus(400)
    // The refusal as the package wrote it, byte for byte and under its own content type — the Buffer path. Pinned
    // on the bytes rather than on the parsed body, which a `response.json()` over `await answer.json()` would
    // satisfy just as well, and on a `content-type` with no `charset` of the kind Adonis appends to a body it
    // serialized itself.
    assert.equal(response.header('content-type'), 'application/json')
    assert.equal(response.text(), JSON.stringify({ error: 'unknown_state', description: UNKNOWN_STATE }))
    assert.equal(response.body().error, 'unknown_state')
  })

  test('me when CAS cannot be reached — 503 with a stable code, never a 500', async ({ client, assert }) => {
    stub.client.guestGrant = async () => {
      throw new ApiError(0, 'network_error', 'fetch failed')
    }

    const response = await client.get('/api/auth/me')

    response.assertStatus(503)
    assert.equal(response.body().error, 'cas_unavailable')
  })

  test('logout with a session — on to CAS, with the session taken back', async ({ client, assert }) => {
    const minted = await client.get('/api/auth/me')

    const response = await client.get('/api/auth/logout').header('cookie', cookiePairOf(minted, SESSION_COOKIE_NAME)).redirects(0)

    response.assertStatus(302)
    assert.equal(response.header('location'), END_SESSION_URL)
    assert.equal(cookiePairOf(response, SESSION_COOKIE_NAME), `${SESSION_COOKIE_NAME}=`)
  })

  test('logout with nothing to end — still a logout, back to the application', async ({ client, assert }) => {
    const response = await client.get('/api/auth/logout').redirects(0)

    response.assertStatus(302)
    assert.equal(response.header('location'), APP_URL)
  })
})
