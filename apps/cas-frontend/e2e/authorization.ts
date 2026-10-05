import { readFile } from 'node:fs/promises'

import type { APIRequestContext, Page } from '@playwright/test'

// The clients e2e/seed.sh registers. The first is public and first-party, so a signed-in browser gets a code without
// consent; the second is confidential, may use the guest grant, and its secret is in e2e/.guest-client-secret.
export const CLIENT_ID = 'cas-frontend-e2e'
export const GUEST_CLIENT_ID = 'cas-frontend-e2e-guest'
// Nothing serves it (a reserved TLD): the tests observe the browser's request to it, not a page.
export const REDIRECT_URI = 'https://client.e2e.test/callback'
// Any S256 challenge is valid here; the code is never exchanged in this suite.
const CODE_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

interface AuthorizationRequestOptions {
  clientId?: string
  /** A guest's ID token: CAS opens an upgrade session and sends the browser to create-account. */
  idTokenHint?: string
}

/** A fresh authorization request of an e2e client: its path on this origin and the `state` it sends. */
export const authorizationRequest = ({ clientId = CLIENT_ID, idTokenHint }: AuthorizationRequestOptions = {}) => {
  const state = Math.random().toString(36).slice(2)
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid',
    state,
    code_challenge: CODE_CHALLENGE,
    code_challenge_method: 'S256',
  })
  if (idTokenHint) {
    query.set('id_token_hint', idTokenHint)
  }
  return { path: `/oidc/authorize?${query.toString()}`, state }
}

/** A query string with `return_to` set to the value, encoded the way a browser would. */
export const returnTo = (value: string) => `?${new URLSearchParams({ return_to: value }).toString()}`

/**
 * The browser's request to the client's redirect URI, with its `code` and
 * `state`. Armed before the action that leads there: CAS answers the
 * authorization request with a redirect, which `page.route` cannot see but
 * the request events report.
 */
export const redirectToClient = async (page: Page) => {
  const request = await page.waitForRequest(request => request.url().startsWith(REDIRECT_URI))
  const url = new URL(request.url())
  return { code: url.searchParams.get('code'), state: url.searchParams.get('state') }
}

const GUEST_SECRET_FILE = new URL('./.guest-client-secret', import.meta.url)

const guestClientSecret = async () => {
  try {
    return (await readFile(GUEST_SECRET_FILE, 'utf8')).trim()
  } catch {
    throw new Error('e2e/.guest-client-secret is missing: run e2e/seed.sh (see docs/TESTS.md)')
  }
}

/**
 * Mints a guest as the application's backend would: the guest grant of the
 * guest client at `/oidc/token`, authenticated with its secret. Returns the
 * guest's fresh ID token, to send as `id_token_hint`, and its `sub`.
 */
export const mintGuest = async (request: APIRequestContext) => {
  const secret = await guestClientSecret()
  // RFC 6749 §2.3.1: both halves are form-encoded before they are joined.
  const credentials = `${encodeURIComponent(GUEST_CLIENT_ID)}:${encodeURIComponent(secret)}`
  const response = await request.post('/oidc/token', {
    headers: { Authorization: `Basic ${Buffer.from(credentials).toString('base64')}` },
    form: { grant_type: 'urn:memebattle:oauth:grant-type:guest', scope: 'openid' },
  })
  if (!response.ok()) {
    throw new Error(`the guest grant failed with ${response.status()}: ${await response.text()}`)
  }
  const { id_token: idToken } = (await response.json()) as { id_token: string }
  const [, payload = ''] = idToken.split('.')
  const { sub } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub: string }
  return { idToken, sub }
}
