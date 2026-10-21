/**
 * The application the suite plays: the package's own `createCasClient`, `createInMemorySessionStore` and
 * `createAuthHandlers`, served over HTTP by `./server.ts`, with a cookie jar in front of them for a browser.
 *
 * A context is one deployment of the application with one browser in front of it. A test that needs two browsers —
 * the replacement scenario does — starts a second context: a fresh store, a fresh server and a fresh jar, the same
 * CAS and the same registered client.
 */

import { createAuthHandlers, createCasClient, createInMemorySessionStore } from '../../src/index'
import type { CasClient, Session, SessionStore } from '../../src/index'
import { parseSetCookie } from './cookies'
import { startAppServer } from './server'
import type { AppServer } from './server'

/** The client `tests/integration/seed.sh` registers, and the audience its access tokens name. */
export const CLIENT_ID = 'ligretto-auth-test'

/**
 * Where the application is, as far as CAS is concerned: the registered redirect URI and post-logout URI are on it.
 * A reserved TLD (`.test`, RFC 2606), so nothing has to serve it — the suite asserts that CAS redirected there and
 * then delivers that one navigation to the local socket the handlers are really on (`Browser.deliver`).
 */
export const APP_URL = 'https://ligretto-auth.test/'
export const REDIRECT_URI = 'https://ligretto-auth.test/auth/callback'

/** The process environment, read through a cast: the package types no Node globals, `process` included. */
const env = (name: string): string | undefined => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]

/** The CAS the suite runs against: the native server's default issuer unless the job names another. */
export const issuer = (): string => env('CAS_ISSUER') ?? 'http://localhost:3000'

/** The secret `seed.sh` captured when it registered the client. Without it nothing can be redeemed, so it is loud. */
const clientSecret = (): string => {
  const secret = env('LIGRETTO_AUTH_CLIENT_SECRET')
  if (secret === undefined || secret === '') {
    throw new Error(
      'LIGRETTO_AUTH_CLIENT_SECRET is not set. Register the client with packages/ligretto-auth/tests/integration/seed.sh ' +
        'and pass the secret it wrote to tests/integration/.client-secret.',
    )
  }
  return secret
}

/** The CAS client of this suite, for the calls a test makes out of band — a refresh it wants to spend itself. */
export const casClient = (): CasClient =>
  createCasClient({
    issuer: issuer(),
    clientId: CLIENT_ID,
    clientSecret: clientSecret(),
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: APP_URL,
  })

/**
 * The application's browser: a cookie jar over real `fetch` against the handlers, following no redirect so the test
 * sees each hop, as `apps/cas/tests/reference_client/browser.rs` does on the CAS side.
 */
export interface Browser {
  /** A navigation to a path of the application, with whatever cookies the jar holds. */
  visit(path: string): Promise<Response>
  /**
   * The callback CAS redirected to: the `Location` must be on the registered application origin, and the same path
   * and query are then fetched from the socket the handlers are really served on.
   */
  deliver(location: string): Promise<Response>
  cookie(name: string): string | undefined
  /**
   * Puts a cookie back in the jar, for presenting one an answer took away: a browser logged out in another tab still
   * holds its session cookie until the `Set-Cookie` reaches it.
   */
  present(name: string, value: string): void
}

const createBrowser = (baseUrl: string): Browser => {
  const jar = new Map<string, string>()

  const send = async (url: string): Promise<Response> => {
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ')
    const response = await fetch(url, { redirect: 'manual', headers: cookie === '' ? {} : { cookie } })
    for (const header of response.headers.getSetCookie()) {
      const cookie = parseSetCookie(header)
      if (cookie === undefined) {
        continue
      }
      if (cookie.removed) {
        jar.delete(cookie.name)
      } else {
        jar.set(cookie.name, cookie.value)
      }
    }
    return response
  }

  return {
    visit: async path => await send(new URL(path, baseUrl).toString()),
    deliver: async location => {
      const target = new URL(location)
      if (new URL(APP_URL).origin !== target.origin) {
        throw new Error(`CAS redirected to ${target.origin}, not to the registered ${new URL(APP_URL).origin}.`)
      }
      return await send(`${baseUrl}${target.pathname}${target.search}`)
    },
    cookie: name => jar.get(name),
    present: (name, value) => void jar.set(name, value),
  }
}

export interface AppContext {
  store: SessionStore
  client: CasClient
  browser: Browser
  server: AppServer
  close(): Promise<void>
}

export const startApp = async (): Promise<AppContext> => {
  const client = casClient()
  const store = createInMemorySessionStore()
  const server = await startAppServer(createAuthHandlers({ client, store, transport: 'cookie', appUrl: APP_URL }))

  return { store, client, browser: createBrowser(server.baseUrl), server, close: server.close }
}

/**
 * The session the store holds under `id`, which a test reads to assert what the handlers persisted — the rotated
 * refresh token, the ID token — and to force a refresh.
 */
export const storedSession = async (store: SessionStore, id: string): Promise<Session> => {
  const session = await store.getSession(id)
  if (session === undefined) {
    throw new Error(`The store holds no session with the id ${JSON.stringify(id)}.`)
  }
  return session
}

/**
 * Stamps the stored access token expired, so the next `me` refreshes.
 *
 * The store belongs to the test, so a refresh is forced by rewriting what the application persisted rather than by
 * faking CAS's clock or sleeping out a ten-minute token.
 */
export const forceExpiry = async (store: SessionStore, id: string): Promise<void> => {
  const session = await storedSession(store, id)
  await store.saveSession({ ...session, accessTokenExpiresAt: 0 })
}
