import { InvalidTokenError, type AccessTokenClaims, type AuthHandlers } from '@memebattle/ligretto-auth'

import { createFixedClock } from '../core/ports/clock.fake.ts'
import { okProbe } from '../core/ports/database-probe.fake.ts'
import { createRecordingLogger, type LogEntry } from '../core/ports/logger.fake.ts'
import { createFakeUsersRepository } from '../core/ports/users-repository.fake.ts'
import type { PublicAppDeps } from './types.ts'

/** The one token the fake verifier accepts. */
export const VALID_ACCESS_TOKEN = 'valid-token'

/** The header each fake auth handler marks its answer with: the name of the handler. */
export const AUTH_HANDLER_HEADER = 'x-auth-handler'

export const claimsOf = (sub: string): AccessTokenClaims => ({
  sub,
  client_id: 'ligretto',
  scope: 'openid profile',
  amr: ['anon'],
  account_type: 'guest',
  iss: 'https://cas.example',
  aud: 'ligretto',
  exp: 0,
  iat: 0,
  jti: 'jti',
})

/** Auth handlers that answer `204` and name themselves in `AUTH_HANDLER_HEADER`, with nothing of a session. */
const fakeAuthHandlers = (): AuthHandlers => {
  const answer = (name: keyof AuthHandlers) => async () => new Response(null, { status: 204, headers: { [AUTH_HANDLER_HEADER]: name } })
  return { me: answer('me'), signIn: answer('signIn'), callback: answer('callback'), logout: answer('logout') }
}

/**
 * The ports of the public app on fakes, for the specs beside the code: a recording logger, a fixed clock, a database
 * that answers, an empty users repository, auth handlers that answer `204`, and a verifier that accepts
 * `VALID_ACCESS_TOKEN` alone. `entries` is the recording logger's list.
 */
export const createFakePublicDeps = (overrides: Partial<PublicAppDeps> = {}): PublicAppDeps & { entries: LogEntry[] } => {
  const { logger, entries } = createRecordingLogger()
  return {
    logger,
    clock: createFixedClock(),
    database: okProbe(),
    corsOrigins: ['http://localhost:5173', 'http://localhost:5174'],
    auth: fakeAuthHandlers(),
    users: createFakeUsersRepository(),
    verifyAccessToken: async token => {
      if (token !== VALID_ACCESS_TOKEN) {
        throw new InvalidTokenError('malformed', 'The fake verifier accepts one token.')
      }
      return claimsOf('fake-sub')
    },
    ...overrides,
    entries,
  }
}
