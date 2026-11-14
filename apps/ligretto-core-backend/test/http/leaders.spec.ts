// GET /api/leaders over the real leaders repository on PGlite and the real access-token verifier, composed as the
// entries compose it (src/entry/auth.ts) over a CAS that serves its metadata from a local fetch. The points are
// written with the statement `saveRound` uses.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createPgGamesRepository } from '../../src/adapters/pg/games-repository.ts'
import { createPgLeadersRepository } from '../../src/adapters/pg/leaders-repository.ts'
import { createPgDatabaseProbe } from '../../src/adapters/pg/probe.ts'
import { createPgUsersRepository } from '../../src/adapters/pg/users-repository.ts'
import { validationFailedSchema } from '../../src/contract/error.ts'
import { leaderboardSchema } from '../../src/contract/leaders.ts'
import { casUnavailableSchema, unauthorizedSchema } from '../../src/contract/users.ts'
import type { AuthConfig } from '../../src/core/config.ts'
import type { RoundResult } from '../../src/core/ports/games-repository.ts'
import { createFixedClock } from '../../src/core/ports/clock.fake.ts'
import { createRecordingLogger } from '../../src/core/ports/logger.fake.ts'
import { createAuth } from '../../src/entry/auth.ts'
import { createPublicApp } from '../../src/http/public-app.ts'
import { casFetch, ISSUER, mintAccessToken, type CasFetch } from '../support/cas-tokens.ts'
import { createTestDatabase } from '../support/pglite.ts'
import { seedUsers } from '../support/seed.ts'

/** 2026-11-14 in Berlin. */
const NOW = Date.UTC(2026, 10, 14, 12)

const ALICE = { sub: 'alice', accountType: 'full', displayName: 'Alice', avatarUrl: 'https://avatars.example/alice.png' } as const
const BOB = { sub: 'bob', accountType: 'full', displayName: 'Bob', avatarUrl: null } as const
const GUEST = { sub: 'guest', accountType: 'guest', displayName: null, avatarUrl: null } as const
const IDLE = { sub: 'idle', accountType: 'full', displayName: 'Idle', avatarUrl: null } as const

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

beforeAll(async () => {
  database = await createTestDatabase()
  const { db } = database
  await seedUsers(db, [ALICE, BOB, GUEST, IDLE])
  const games = createPgGamesRepository(db)
  const { id } = await games.createGame()
  const addPoints = (day: string, results: RoundResult[]) => games.withGame(id, game => game.addPoints(day, results))
  await addPoints('2026-11-14', [
    { playerId: ALICE.sub, score: 5 },
    { playerId: BOB.sub, score: 3 },
    { playerId: GUEST.sub, score: 50 },
  ])
  await addPoints('2026-10-16', [{ playerId: BOB.sub, score: 10 }])
  await addPoints('2026-10-15', [{ playerId: ALICE.sub, score: 100 }])
})

afterAll(async () => {
  await database?.close()
})

beforeEach(() => {
  // A fresh composition per test, so a metadata cache never outlives the case that filled it.
  const { db } = database
  cas = casFetch()
  const { handlers, verifyAccessToken } = createAuth({ config, databases: { main: db, locks: db }, clock: createFixedClock(), fetch: cas.fetch })
  app = createPublicApp({
    logger: createRecordingLogger().logger,
    clock: createFixedClock(NOW),
    database: createPgDatabaseProbe(db),
    auth: handlers,
    users: createPgUsersRepository(db),
    leaders: createPgLeadersRepository(db),
    verifyAccessToken,
  })
})

const listLeaders = async (search: string, token: string | null) =>
  app.request(`/api/leaders${search}`, { headers: token === null ? {} : { authorization: `Bearer ${token}` } })

const tokenOf = (sub: string, accountType: 'full' | 'guest' = 'full') => mintAccessToken({ sub, accountType })

const leader = (user: typeof ALICE | typeof BOB, totalPoints: number, place: number) => ({
  sub: user.sub,
  name: user.displayName,
  avatarUrl: user.avatarUrl,
  totalPoints,
  place,
})

const expectUnauthorized = async (res: Response) => {
  expect(res.status).toBe(401)
  expect(res.headers.get('www-authenticate')).toBe('Bearer')
  expect(unauthorizedSchema.parse(await res.json()).error).toBe('unauthorized')
}

describe('GET /api/leaders', () => {
  it.each([
    ['day', [leader(ALICE, 5, 1), leader(BOB, 3, 2)], leader(ALICE, 5, 1)],
    ['month', [leader(BOB, 13, 1), leader(ALICE, 5, 2)], leader(ALICE, 5, 2)],
    ['all', [leader(ALICE, 105, 1), leader(BOB, 13, 2)], leader(ALICE, 105, 1)],
  ])('answers the full accounts of the %s and the caller among them', async (period, leaders, me) => {
    const res = await listLeaders(`?period=${period}`, await tokenOf(ALICE.sub))
    expect(res.status).toBe(200)
    expect(leaderboardSchema.parse(await res.json())).toEqual({ leaders, me })
  })

  it.each([
    ['a guest', GUEST.sub, 'guest'],
    ['a full account without points', IDLE.sub, 'full'],
  ] as const)('answers me: null for %s', async (_name, sub, accountType) => {
    const res = await listLeaders('?period=day', await tokenOf(sub, accountType))
    expect(res.status).toBe(200)
    expect(leaderboardSchema.parse(await res.json())).toEqual({ leaders: [leader(ALICE, 5, 1), leader(BOB, 3, 2)], me: null })
  })

  it.each([
    ['without a period', ''],
    ['with an unknown period', '?period=week'],
  ])('answers 400 validation_failed %s', async (_name, search) => {
    const res = await listLeaders(search, await tokenOf(ALICE.sub))
    expect(res.status).toBe(400)
    expect(validationFailedSchema.parse(await res.json()).issues.map(issue => issue.path)).toContain('period')
  })

  it('refuses a request without a token, before validating the query', async () => {
    await expectUnauthorized(await listLeaders('', null))
  })

  it('refuses a token minted for another audience', async () => {
    await expectUnauthorized(await listLeaders('?period=day', await mintAccessToken({ sub: ALICE.sub, aud: 'other' })))
  })

  it("answers 503 cas_unavailable when CAS's metadata cannot be read", async () => {
    cas.fail()
    const res = await listLeaders('?period=day', await tokenOf(ALICE.sub))
    expect(res.status).toBe(503)
    expect(casUnavailableSchema.parse(await res.json()).error).toBe('cas_unavailable')
  })
})
