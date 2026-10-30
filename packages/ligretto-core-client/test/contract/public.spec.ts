// The generated operations of the root entry against the real public app (createPublicApp over PGlite, the real
// access-token verifier, the scripted auth stubs) through a custom `fetch`: every operation, every declared status
// and code once, every body checked against the committed openapi.json.
import {
  APP_URL,
  AUTHORIZATION_URL,
  createContractHarness,
  mintAccessToken,
  STATE,
  type ContractHarness,
} from '@memebattle/ligretto-core-backend/contract-harness'
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'

import {
  authCallback,
  createClient,
  getHealth,
  getMe,
  listUsers,
  logout,
  signIn,
  type AuthUser,
  type Client,
  type HealthReport,
} from '@memebattle/ligretto-core-client'
import { cookiesOf, createRecorder, expectEveryPairExercised, readDocument } from '../support/contract'

const BASE_URL = 'http://ligretto-core.test'

const ALICE = { sub: 'alice', accountType: 'full', displayName: 'Alice', avatarUrl: 'https://avatars.example/alice.png' } as const
const BOB = { sub: 'bob', accountType: 'guest', displayName: null, avatarUrl: null } as const

const recorder = createRecorder(readDocument('openapi.json'))

let harness: ContractHarness
let cookie: Client
let bearer: Client

beforeAll(async () => {
  harness = await createContractHarness()
  cookie = recorder.wrap(createClient({ baseUrl: BASE_URL, fetch: harness.publicFetch('cookie') }))
  bearer = recorder.wrap(createClient({ baseUrl: BASE_URL, fetch: harness.publicFetch('bearer') }))
})

beforeEach(async () => {
  await harness.reset()
  await harness.seedUsers([ALICE, BOB])
})

afterAll(async () => {
  // Undefined when beforeAll timed out: its error is the one to report, not a close or a coverage failure.
  if (harness === undefined) {
    return
  }
  await harness.close()
  expectEveryPairExercised(recorder)
})

/** A session in the cookie transport, as the browser holds it after its first `me`. */
const session = async (): Promise<string> => {
  const minted = await getMe({ client: cookie })
  expect(minted.kind).toBe('success')
  return cookiesOf(minted.kind === 'success' ? minted.headers : new Headers())
}

/** The state cookie a cookie-transport `sign-in` binds to the browser. */
const signInStarted = async (): Promise<string> => {
  const begun = await signIn({ client: cookie })
  expect(begun.kind).toBe('redirect')
  return cookiesOf(begun.kind === 'redirect' ? begun.headers : new Headers())
}

describe('getHealth', () => {
  it('answers 200 with the report', async () => {
    expect(await getHealth({ client: cookie })).toMatchObject({ kind: 'success', status: 200, data: { status: 'ok' } })
  })

  it('answers the whole HealthReport as the error of its 503', async () => {
    harness.database.down()
    const result = await getHealth({ client: cookie })
    expect(result).toMatchObject({ kind: 'error', status: 503, error: { status: 'unavailable', checks: { database: { status: 'failed' } } } })
    if (result.kind === 'error' && result.status === 503) {
      expectTypeOf(result.error).toEqualTypeOf<HealthReport>()
    }
  })
})

describe('getMe', () => {
  it('answers 200 with a new guest, and the session cookie in the headers', async () => {
    const result = await getMe({ client: cookie })
    expect(result).toMatchObject({ kind: 'success', status: 200, data: { user: { accountType: 'guest' } } })
    expect(result.kind === 'success' && result.headers.getSetCookie()).not.toEqual([])
  })

  it('answers 429 rate_limit_exceeded with Retry-After', async () => {
    harness.cas.refuse('rate_limited')
    const result = await getMe({ client: cookie })
    expect(result).toMatchObject({ kind: 'error', status: 429, error: { error: 'rate_limit_exceeded' } })
    expect(result.kind === 'error' && result.headers.get('retry-after')).toBe('30')
  })

  it('answers 503 cas_unavailable with the code CAS named', async () => {
    harness.cas.refuse('unavailable')
    expect(await getMe({ client: cookie })).toMatchObject({
      kind: 'error',
      status: 503,
      error: { error: 'cas_unavailable', casError: 'unreachable' },
    })
  })

  it('answers 503 cas_rejected', async () => {
    harness.cas.refuse('rejected')
    expect(await getMe({ client: cookie })).toMatchObject({
      kind: 'error',
      status: 503,
      error: { error: 'cas_rejected', casError: 'invalid_client' },
    })
  })

  it('answers 503 session_busy when the session lock is not granted', async () => {
    const cookies = await session()
    harness.sessions.busy()
    expect(await getMe({ client: cookie, headers: { cookie: cookies } })).toMatchObject({
      kind: 'error',
      status: 503,
      error: { error: 'session_busy' },
    })
  })
})

describe('signIn', () => {
  it('answers 200 with the URL to navigate to in the bearer transport', async () => {
    expect(await signIn({ client: bearer })).toMatchObject({ kind: 'success', status: 200, data: { url: AUTHORIZATION_URL } })
  })

  it('answers a redirect to CAS in the cookie transport, never followed', async () => {
    expect(await signIn({ client: cookie })).toMatchObject({ kind: 'redirect', status: 302, location: AUTHORIZATION_URL })
  })

  it.each([
    ['rate_limited', 429, 'rate_limit_exceeded'],
    ['unavailable', 503, 'cas_unavailable'],
    ['rejected', 503, 'cas_rejected'],
  ] as const)('answers a CAS that is %s with %d %s', async (refusal, status, code) => {
    harness.cas.refuse(refusal)
    expect(await signIn({ client: cookie })).toMatchObject({ kind: 'error', status, error: { error: code } })
  })

  it('answers 503 session_busy', async () => {
    harness.sessions.busy()
    expect(await signIn({ client: cookie })).toMatchObject({ kind: 'error', status: 503, error: { error: 'session_busy' } })
  })
})

describe('authCallback', () => {
  it('answers a redirect to the application with the state cookie of the sign-in', async () => {
    const cookies = await signInStarted()
    const result = await authCallback({ client: cookie, query: { code: 'the-code', state: STATE }, headers: { cookie: cookies } })
    expect(result).toMatchObject({ kind: 'redirect', status: 302, location: APP_URL })
  })

  it('answers 400 unknown_state without the state cookie', async () => {
    expect(await authCallback({ client: cookie, query: { code: 'the-code', state: STATE } })).toMatchObject({
      kind: 'error',
      status: 400,
      error: { error: 'unknown_state' },
    })
  })

  it.each([
    ['access_denied', 400, 'sign_in_failed'],
    ['temporarily_unavailable', 503, 'cas_unavailable'],
    ['invalid_scope', 503, 'cas_rejected'],
  ] as const)('answers the CAS error %s with %d %s', async (casError, status, code) => {
    const cookies = await signInStarted()
    const result = await authCallback({ client: cookie, query: { state: STATE, error: casError }, headers: { cookie: cookies } })
    expect(result).toMatchObject({ kind: 'error', status, error: { error: code, casError } })
  })

  it('answers 429 when CAS rate-limits the code exchange', async () => {
    const cookies = await signInStarted()
    harness.cas.refuse('rate_limited')
    const result = await authCallback({ client: cookie, query: { code: 'the-code', state: STATE }, headers: { cookie: cookies } })
    expect(result).toMatchObject({ kind: 'error', status: 429, error: { error: 'rate_limit_exceeded' } })
  })

  it('answers 503 session_busy', async () => {
    const cookies = await signInStarted()
    harness.sessions.busy()
    const result = await authCallback({ client: cookie, query: { code: 'the-code', state: STATE }, headers: { cookie: cookies } })
    expect(result).toMatchObject({ kind: 'error', status: 503, error: { error: 'session_busy' } })
  })
})

describe('logout', () => {
  it('answers 200 with the URL to navigate to in the bearer transport', async () => {
    expect(await logout({ client: bearer })).toMatchObject({ kind: 'success', status: 200, data: { url: APP_URL } })
  })

  it('answers a redirect in the cookie transport', async () => {
    expect(await logout({ client: cookie })).toMatchObject({ kind: 'redirect', status: 302, location: APP_URL })
  })

  it('answers 503 cas_unavailable when the end-session URL cannot be built, keeping the session', async () => {
    const cookies = await session()
    harness.cas.refuse('unavailable')
    expect(await logout({ client: cookie, headers: { cookie: cookies } })).toMatchObject({
      kind: 'error',
      status: 503,
      error: { error: 'cas_unavailable' },
    })
  })

  it('answers 503 session_busy', async () => {
    const cookies = await session()
    harness.sessions.busy()
    expect(await logout({ client: cookie, headers: { cookie: cookies } })).toMatchObject({
      kind: 'error',
      status: 503,
      error: { error: 'session_busy' },
    })
  })
})

describe('listUsers', () => {
  const bearerOf = async (sub = ALICE.sub) => ({ authorization: `Bearer ${await mintAccessToken({ sub })}` })

  it('answers 200 with both users for two ids, sent as repeated keys', async () => {
    const result = await listUsers({ client: cookie, query: { ids: [ALICE.sub, BOB.sub] }, headers: await bearerOf() })
    expect(result.kind).toBe('success')
    if (result.kind === 'success') {
      expectTypeOf(result.data).toEqualTypeOf<AuthUser[]>()
      expect(result.data).toEqual(
        expect.arrayContaining([
          { sub: ALICE.sub, accountType: ALICE.accountType, name: ALICE.displayName, avatarUrl: ALICE.avatarUrl },
          { sub: BOB.sub, accountType: BOB.accountType, name: null, avatarUrl: null },
        ]),
      )
      expect(result.data).toHaveLength(2)
    }
  })

  it('answers 400 validation_failed with the issues for no ids', async () => {
    const result = await listUsers({ client: cookie, query: { ids: [] }, headers: await bearerOf() })
    expect(result).toMatchObject({ kind: 'error', status: 400, error: { error: 'validation_failed' } })
    expect(result.kind === 'error' && result.status === 400 && result.error.issues).not.toEqual([])
  })

  it('answers 401 unauthorized with WWW-Authenticate without a token', async () => {
    const result = await listUsers({ client: cookie, query: { ids: [ALICE.sub] } })
    expect(result).toMatchObject({ kind: 'error', status: 401, error: { error: 'unauthorized' } })
    expect(result.kind === 'error' && result.headers.get('www-authenticate')).toBe('Bearer')
  })

  it("answers 503 cas_unavailable when CAS's metadata cannot be read for a valid token", async () => {
    harness.cas.metadataDown()
    const result = await listUsers({ client: cookie, query: { ids: [ALICE.sub] }, headers: await bearerOf() })
    expect(result).toMatchObject({ kind: 'error', status: 503, error: { error: 'cas_unavailable' } })
    if (result.kind === 'error' && result.status === 503) {
      expectTypeOf(result.error.error).toEqualTypeOf<'cas_unavailable'>()
    }
  })

  it('starts every case with a cold metadata cache, so a verification never leaks across reset()', async () => {
    const headers = await bearerOf()
    expect(await listUsers({ client: cookie, query: { ids: [ALICE.sub] }, headers })).toMatchObject({ kind: 'success', status: 200 })
    await harness.reset()
    await harness.seedUsers([ALICE])
    harness.cas.metadataDown()
    expect(await listUsers({ client: cookie, query: { ids: [ALICE.sub] }, headers })).toMatchObject({ kind: 'error', status: 503 })
  })
})

describe('the base URL', () => {
  it('reaches the routes with a trailing slash', async () => {
    const trailing = recorder.wrap(createClient({ baseUrl: `${BASE_URL}/`, fetch: harness.publicFetch('cookie') }))
    expect(await getHealth({ client: trailing })).toMatchObject({ kind: 'success', status: 200 })
  })
})
