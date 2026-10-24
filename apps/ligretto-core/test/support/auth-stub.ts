/**
 * The four handlers of `@memebattle/ligretto-auth` over a scripted `CasClient` and the package's in-memory session
 * store, ported from ligretto-core-backend's `tests/helpers/authStub.ts`.
 *
 * The stub sits at the `CasClient` object, not at HTTP: the package's own suites drive the protocol against a fake
 * CAS, so what is left here is that the routes are mounted and that their answers reach the client intact. Every
 * method is a plain property, so a test reassigns one to script a failure.
 */
import { createAuthHandlers, createInMemorySessionStore } from '@memebattle/ligretto-auth'
import type { AuthHandlers, CasClient, SessionStore, SessionTransportKind } from '@memebattle/ligretto-auth'

import { refreshTokenFor, tokensOf } from './session-store'

/** Where the handlers send a browser once a sign-in or a logout is over. */
export const APP_URL = 'http://127.0.0.1:5174/'

/** What the stub's `authorizationRequest` answers: a `sign-in` sends the browser here. */
export const AUTHORIZATION_URL = 'https://cas.example/oidc/authorize?client_id=ligretto&state=test-state'

/** What the stub's `endSessionUrl` answers: a `logout` with a session sends the browser here. */
export const END_SESSION_URL = 'https://cas.example/oidc/end-session?id_token_hint=test'

/** The `state` of every authorization request the stub builds, so a test can present it back at the callback. */
export const STATE = 'test-state'

export const GUEST_SUB = 'guest-of-the-stub'
export const FULL_SUB = 'account-of-the-stub'
export const FULL_DISPLAY_NAME = 'Scripted Account'

export interface AuthStub {
  /** Reassign one of its methods to script a failure; the handlers read them at call time. */
  client: CasClient
  store: SessionStore
  handlers: AuthHandlers
}

export const createAuthStub = ({
  transport = 'cookie',
  store = createInMemorySessionStore(),
}: { transport?: SessionTransportKind; store?: SessionStore } = {}): AuthStub => {
  const client: CasClient = {
    authorizationRequest: async () => ({ url: AUTHORIZATION_URL, state: STATE, nonce: 'test-nonce', codeVerifier: 'test-verifier' }),
    exchangeCode: async () =>
      tokensOf({ sub: FULL_SUB, refreshToken: refreshTokenFor(FULL_SUB), accountType: 'full', displayName: FULL_DISPLAY_NAME }),
    // The next generation of whatever token it was given, as the store suite's stub rotates: a session refreshed
    // twice must not be handed the token it already spent.
    refresh: async refreshToken => {
      const separator = refreshToken.lastIndexOf('#')
      const sub = refreshToken.slice(0, separator)
      return tokensOf({ sub, refreshToken: refreshTokenFor(sub, Number(refreshToken.slice(separator + 1)) + 1) })
    },
    guestGrant: async () => tokensOf({ sub: GUEST_SUB, refreshToken: refreshTokenFor(GUEST_SUB), accountType: 'guest' }),
    endSessionUrl: async () => END_SESSION_URL,
  }

  return { client, store, handlers: createAuthHandlers({ client, store, transport, appUrl: APP_URL }) }
}
