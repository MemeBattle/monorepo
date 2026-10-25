// GET /api/users over the real users repository on PGlite and the real access-token verifier, composed as the entries
// compose it (src/entry/auth.ts) over a CAS that serves its metadata from a local fetch. Ports the cases of
// the previous service's UsersController.test.ts; its 422s are 400 validation_failed (docs/adrs/error-responses.md).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createPgDatabaseProbe } from '../../src/adapters/pg/probe'
import { createPgUsersRepository } from '../../src/adapters/pg/users-repository'
import { validationFailedSchema } from '../../src/contract/error'
import { casUnavailableSchema, listUsersResponseSchema, unauthorizedSchema } from '../../src/contract/users'
import type { AuthConfig } from '../../src/core/config'
import { createFixedClock } from '../../src/core/ports/clock.fake'
import { createRecordingLogger } from '../../src/core/ports/logger.fake'
import { createAuth } from '../../src/entry/auth'
import { createPublicApp } from '../../src/http/public-app'
import { casFetch, ISSUER, mintAccessToken, type CasFetch } from '../support/cas-tokens'
import { createTestDatabase } from '../support/pglite'
import { seedUsers } from '../support/seed'

const ACCOUNT = { sub: 'account-id', accountType: 'full', name: 'Some Name', avatarUrl: 'https://avatars.example/a.png' } as const
const GUEST = { sub: 'guest-id', accountType: 'guest', name: null, avatarUrl: null } as const

const config: AuthConfig = {
  casIssuer: ISSUER,
  clientId: 'ligretto',
  clientSecret: 'a-secret',
  redirectUri: 'https://ligretto.example/api/auth/callback',
  postLogoutRedirectUri: 'https://ligretto.example/',
  appUrl: 'https://ligretto.example/',
  sessionTransport: 'cookie',
}

let database: Awaited<ReturnType<typeof createTestDatabase>>
let cas: CasFetch
let app: ReturnType<typeof createPublicApp>
let token: string

beforeAll(async () => {
  database = await createTestDatabase()
  token = await mintAccessToken({ sub: ACCOUNT.sub })
})

afterAll(async () => {
  await database.close()
})

beforeEach(async () => {
  const { db } = database
  await db.deleteFrom('users').execute()
  await seedUsers(db, [
    { sub: ACCOUNT.sub, accountType: ACCOUNT.accountType, displayName: ACCOUNT.name, avatarUrl: ACCOUNT.avatarUrl },
    { sub: GUEST.sub, accountType: GUEST.accountType, displayName: GUEST.name, avatarUrl: GUEST.avatarUrl },
  ])
  // A fresh composition per test, so a metadata cache never outlives the case that filled it.
  cas = casFetch()
  const { handlers, verifyAccessToken } = createAuth({ config, databases: { main: db, locks: db }, clock: createFixedClock(), fetch: cas.fetch })
  app = createPublicApp({
    logger: createRecordingLogger().logger,
    clock: createFixedClock(),
    database: createPgDatabaseProbe(db),
    auth: handlers,
    users: createPgUsersRepository(db),
    verifyAccessToken,
  })
})

const query = (ids: string[]) => ids.map(id => `ids=${encodeURIComponent(id)}`).join('&')

/** `bearer: null` sends no Authorization header. */
const listUsers = (search: string, bearer: string | null = token) =>
  app.request(`/api/users${search}`, { headers: bearer === null ? {} : { authorization: `Bearer ${bearer}` } })

const expectValidationFailed = async (res: Response) => {
  expect(res.status).toBe(400)
  const body = validationFailedSchema.parse(await res.json())
  expect(body.issues.map(issue => issue.path)).toContainEqual(expect.stringMatching(/^ids/))
}

const expectUnauthorized = async (res: Response) => {
  expect(res.status).toBe(401)
  expect(res.headers.get('www-authenticate')).toBe('Bearer')
  expect(unauthorizedSchema.parse(await res.json()).error).toBe('unauthorized')
}

describe('GET /api/users', () => {
  it('answers the four fields of each id, and nothing else of the row', async () => {
    const res = await listUsers(`?${query([ACCOUNT.sub, GUEST.sub])}`)
    expect(res.status).toBe(200)
    // By membership: a lookup by a set of ids promises no order.
    const body = listUsersResponseSchema.parse(await res.json())
    expect(body).toHaveLength(2)
    expect(body).toEqual(expect.arrayContaining([ACCOUNT, GUEST]))
  })

  it('leaves an unknown id out', async () => {
    const res = await listUsers(`?${query([ACCOUNT.sub, 'never-seen'])}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([ACCOUNT])
  })

  it('answers a single bare ids as the array form', async () => {
    const res = await listUsers(`?ids=${GUEST.sub}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([GUEST])
  })

  it('answers a repeated id once', async () => {
    const res = await listUsers(`?${query([GUEST.sub, GUEST.sub])}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([GUEST])
  })

  it('accepts 100 ids', async () => {
    const ids = [ACCOUNT.sub, ...Array.from({ length: 99 }, (_, index) => `unknown-${index}`)]
    const res = await listUsers(`?${query(ids)}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([ACCOUNT])
  })

  it('refuses 101 ids', async () => {
    await expectValidationFailed(await listUsers(`?${query(Array.from({ length: 101 }, (_, index) => `id-${index}`))}`))
  })

  it('refuses a request without ids', async () => {
    await expectValidationFailed(await listUsers(''))
  })

  it('refuses an empty ids', async () => {
    await expectValidationFailed(await listUsers('?ids='))
  })

  it.each(['guest', 'full'] as const)('accepts the access token of a %s account', async accountType => {
    const res = await listUsers(`?ids=${ACCOUNT.sub}`, await mintAccessToken({ sub: 'someone', accountType }))
    expect(res.status).toBe(200)
  })

  it('refuses a token minted for another audience', async () => {
    await expectUnauthorized(await listUsers(`?ids=${ACCOUNT.sub}`, await mintAccessToken({ sub: ACCOUNT.sub, aud: 'other' })))
  })

  it('refuses an expired token', async () => {
    const exp = Math.floor(Date.now() / 1000) - 60
    await expectUnauthorized(await listUsers(`?ids=${ACCOUNT.sub}`, await mintAccessToken({ sub: ACCOUNT.sub, exp })))
  })

  it('refuses a request without a token, before validating the query', async () => {
    await expectUnauthorized(await listUsers('', null))
  })

  it("answers 503 cas_unavailable when CAS's metadata cannot be read", async () => {
    cas.fail()
    const res = await listUsers(`?ids=${ACCOUNT.sub}`)
    expect(res.status).toBe(503)
    expect(casUnavailableSchema.parse(await res.json()).error).toBe('cas_unavailable')
  })

  it('answers 503 cas_unavailable when CAS stalls, within the CAS request bound', async () => {
    // A cold metadata cache, as after a start: the verifier's own discovery request is the one that stalls.
    const stalled = casFetch()
    stalled.stall()
    const { handlers, verifyAccessToken } = createAuth({
      config,
      databases: { main: database.db, locks: database.db },
      clock: createFixedClock(),
      fetch: stalled.fetch,
      casRequestTimeoutMs: 50,
    })
    const stallingApp = createPublicApp({
      logger: createRecordingLogger().logger,
      clock: createFixedClock(),
      database: createPgDatabaseProbe(database.db),
      auth: handlers,
      users: createPgUsersRepository(database.db),
      verifyAccessToken,
    })
    const res = await stallingApp.request(`/api/users?ids=${ACCOUNT.sub}`, { headers: { authorization: `Bearer ${token}` } })
    expect(res.status).toBe(503)
    expect(casUnavailableSchema.parse(await res.json()).error).toBe('cas_unavailable')
  }, 2_000)
})
