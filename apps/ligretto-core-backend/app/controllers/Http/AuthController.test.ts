/**
 * The four routes are mounted, and `#helpers/webHandler` carries the package's answers across intact. What the
 * handlers decide is proved in `packages/ligretto-auth` against a fake CAS; here the CAS client is a scripted
 * object (`tests/helpers/authStub.ts`) and the subject is the seam.
 */

import { test } from '@japa/runner'
import type { ApiResponse } from '@japa/api-client'
import { ApiError, SESSION_COOKIE_NAME, STATE_COOKIE_NAME } from '@memebattle/ligretto-auth'
import type { AuthStub } from '../../../tests/helpers/authStub.js'
import {
  APP_URL,
  AUTHORIZATION_URL,
  END_SESSION_URL,
  FULL_SUB,
  GUEST_SUB,
  STATE,
  bindAuthHandlers,
  bindAuthHandlersOver,
} from '../../../tests/helpers/authStub.js'

/**
 * The `Set-Cookie` values of an answer, one string per header. `@japa/api-client` types the header as a single
 * string, while Node's client hands repeated headers over as a list — and the list is the case that matters here.
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
 * The `description` of the package's `unknown_state` refusal, duplicated as a literal: an expectation derived from
 * the answer itself would pin none of the package's encoding.
 */
const UNKNOWN_STATE = 'The callback does not match a sign-in this browser started.'

test.group('/api/auth/*', group => {
  let stub: AuthStub

  group.each.setup(() => {
    stub = bindAuthHandlers()
  })

  test('me with no session — a guest, and the session minted for it', async ({ client, assert }) => {
    const response = await client.get('/api/auth/me')

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.user.sub, GUEST_SUB)
    assert.equal(body.user.accountType, 'guest')
    assert.isNull(body.user.name)
    // The only way the browser ever learns the id.
    assert.exists(cookiePairOf(response, SESSION_COOKIE_NAME))
  })

  test('me with that session — the same account, and no new session cookie', async ({ client, assert }) => {
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

  test('callback — the session set and the state cleared, as two cookies', async ({ client, assert }) => {
    const begun = await client.get('/api/auth/sign-in').redirects(0)

    const response = await client
      .get('/api/auth/callback')
      .qs({ code: 'the-code', state: STATE })
      .header('cookie', cookiePairOf(begun, STATE_COOKIE_NAME))
      .redirects(0)

    response.assertStatus(302)
    assert.equal(response.header('location'), APP_URL)
    // Two headers, not one comma-joined value: no browser splits a folded `Set-Cookie` back correctly.
    assert.lengthOf(setCookiesOf(response), 2)
    assert.equal(cookiePairOf(response, STATE_COOKIE_NAME), `${STATE_COOKIE_NAME}=`)

    const session = valueOf(cookiePairOf(response, SESSION_COOKIE_NAME), SESSION_COOKIE_NAME)
    assert.equal((await stub.store.getSession(session))?.sub, FULL_SUB)
  })

  test('callback with a state this browser never started — 400, with the body intact', async ({ client, assert }) => {
    const response = await client.get('/api/auth/callback').qs({ code: 'the-code', state: STATE }).redirects(0)

    response.assertStatus(400)
    // The refusal as the package wrote it, compared against literals: its stable code, its compact encoding and
    // its `content-type`. A flat JSON body survives being reserialized, so the Buffer path is the next case's
    // subject, not this one's.
    assert.equal(response.header('content-type'), 'application/json')
    assert.equal(response.text(), JSON.stringify({ error: 'unknown_state', description: UNKNOWN_STATE }))
    assert.equal(response.body().error, 'unknown_state')
  })

  test('an answer that is not JSON — the bytes the handler produced, under its own content type', async ({ client, assert }) => {
    const bytes = 'sub,name\n1,a\n'
    // No route of the package can stand in here: all four answer JSON or nothing, and JSON survives a
    // reserialization unchanged. Only a body `JSON.parse` would reject separates forwarding the handler's bytes
    // from parsing and re-encoding them.
    bindAuthHandlersOver(stub, { me: async () => new Response(bytes, { headers: { 'content-type': 'text/csv' } }) })

    const response = await client.get('/api/auth/me')

    response.assertStatus(200)
    assert.equal(response.header('content-type'), 'text/csv')
    assert.equal(response.text(), bytes)
  })

  test('me when CAS cannot be reached — 503 with a stable code, never a 500', async ({ client, assert }) => {
    stub.client.guestGrant = async () => {
      throw new ApiError(0, 'network_error', 'fetch failed')
    }

    const response = await client.get('/api/auth/me')

    response.assertStatus(503)
    assert.equal(response.body().error, 'cas_unavailable')
  })

  test('logout with a session — a redirect to CAS, and the session cleared', async ({ client, assert }) => {
    const minted = await client.get('/api/auth/me')

    const response = await client.get('/api/auth/logout').header('cookie', cookiePairOf(minted, SESSION_COOKIE_NAME)).redirects(0)

    response.assertStatus(302)
    assert.equal(response.header('location'), END_SESSION_URL)
    assert.equal(cookiePairOf(response, SESSION_COOKIE_NAME), `${SESSION_COOKIE_NAME}=`)
  })

  test('logout with no session — still a redirect back to the application', async ({ client, assert }) => {
    const response = await client.get('/api/auth/logout').redirects(0)

    response.assertStatus(302)
    assert.equal(response.header('location'), APP_URL)
  })
})
