/**
 * What the store suite builds its fixtures from: a `CasClient` whose `refresh` can be held open and counted, and
 * the factories for the port's own shapes.
 */

import type { Database } from '@adonisjs/lucid/database'
import type { AccountType, CasClient, Session, Tokens } from '@memebattle/ligretto-auth'

/**
 * A refresh token that names the account it belongs to and which rotation it is.
 *
 * The stub has to answer the profile of the account whose token it was given — `refreshSession` takes the new
 * session's `sub` straight from the response — and a test with several sessions in flight hands it several
 * tokens, so the token itself carries what the answer needs.
 */
export const refreshTokenFor = (sub: string, generation = 0): string => `${sub}#${generation}`

const accountOf = (refreshToken: string): { sub: string; generation: number } => {
  const separator = refreshToken.lastIndexOf('#')
  return { sub: refreshToken.slice(0, separator), generation: Number(refreshToken.slice(separator + 1)) }
}

export interface TokensOptions {
  sub: string
  refreshToken: string
  /** Seconds the access token lives. Longer than `refreshSession`'s minute of slack, so a second caller skips. */
  expiresIn?: number
  accountType?: AccountType
  displayName?: string | null
  avatarUrl?: string | null
}

export const tokensOf = ({
  sub,
  refreshToken,
  expiresIn = 3600,
  accountType = 'full',
  displayName = null,
  avatarUrl = null,
}: TokensOptions): Tokens => ({
  accessToken: `access:${refreshToken}`,
  refreshToken,
  idToken: `id:${refreshToken}`,
  expiresIn,
  scope: 'openid profile',
  claims: {
    sub,
    iss: 'https://cas.example',
    aud: 'ligretto-core',
    exp: 0,
    iat: 0,
    account_type: accountType,
    amr: ['webauthn'],
  },
  profile: { sub, accountType, displayName, avatarUrl },
})

export interface SessionOptions {
  id: string
  sub: string
  /** Epoch ms. Stamped in the past by default, so a refresh actually runs. */
  accessTokenExpiresAt?: number
  grantEndsAt?: number
  createdAt?: number
  accountType?: AccountType
  displayName?: string | null
  avatarUrl?: string | null
  generation?: number
}

export const sessionOf = ({
  id,
  sub,
  accessTokenExpiresAt = 0,
  grantEndsAt = Number.MAX_SAFE_INTEGER,
  createdAt = 0,
  accountType = 'full',
  displayName = null,
  avatarUrl = null,
  generation = 0,
}: SessionOptions): Session => {
  const refreshToken = refreshTokenFor(sub, generation)
  return {
    id,
    sub,
    accountType,
    displayName,
    avatarUrl,
    refreshToken,
    accessToken: `access:${refreshToken}`,
    accessTokenExpiresAt,
    grantEndsAt,
    idToken: `id:${refreshToken}`,
    createdAt,
  }
}

export interface GatedCas {
  client: CasClient
  /** Every refresh token `refresh` has been called with, in order. */
  refreshCalls: string[]
  /** Lets every held call return, and every later one through. */
  release(): void
}

/**
 * A `CasClient` whose `refresh` records its calls and waits for `release()` before answering, so a test can be
 * certain of what is in flight at the moment it looks. The rotation it answers is the next generation of the
 * token it was given, with that account's profile.
 */
export const createGatedCas = ({
  displayName = null,
  avatarUrl = null,
}: { displayName?: string | null; avatarUrl?: string | null } = {}): GatedCas => {
  const refreshCalls: string[] = []
  let open = false
  let openGate = (): void => {}
  const gate = new Promise<void>(resolve => {
    openGate = resolve
  })

  const refresh = async (refreshToken: string): Promise<Tokens> => {
    refreshCalls.push(refreshToken)
    if (!open) {
      await gate
    }
    const { sub, generation } = accountOf(refreshToken)
    return tokensOf({ sub, refreshToken: refreshTokenFor(sub, generation + 1), displayName, avatarUrl })
  }

  const unused = (name: string) => async (): Promise<never> => {
    throw new Error(`The stub CAS client has no ${name}.`)
  }

  return {
    client: {
      refresh,
      authorizationRequest: unused('authorizationRequest'),
      exchangeCode: unused('exchangeCode'),
      guestGrant: unused('guestGrant'),
      endSessionUrl: unused('endSessionUrl'),
    } as unknown as CasClient,
    refreshCalls,
    release: () => {
      open = true
      openGate()
    },
  }
}

export const sleep = async (ms: number): Promise<void> => await new Promise(resolve => setTimeout(resolve, ms))

/** Waits for `condition`, rather than guessing how long the thing being waited for takes. */
export const until = async (condition: () => boolean, { timeout = 10_000, label = 'condition' } = {}): Promise<void> => {
  const deadline = Date.now() + timeout
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeout}ms waiting for ${label}.`)
    }
    await sleep(10)
  }
}

/** True once `promise` has settled, without waiting on it or making an unhandled rejection of it. */
export const settlementOf = (promise: Promise<unknown>): { settled: () => boolean } => {
  let settled = false
  void promise.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  return { settled: () => settled }
}

/** Everything the store writes, emptied between tests; `sessions` before `users`, which it references. */
export const truncateAuthTables = async (db: Database): Promise<void> => {
  const pg = db.connection('pg')
  await pg.from('sessions').delete()
  await pg.from('session_locks').delete()
  await pg.from('auth_requests').delete()
  await pg.from('users').delete()
}
