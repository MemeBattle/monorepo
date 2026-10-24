// The internal games routes over the real Postgres adapters on PGlite: here because src/http may not import
// src/adapters (docs/adrs/testing-strategy.md). Ports the cases of ligretto-core-backend's GamesService.test.ts and
// GamesController.test.ts; the GET /api/games cases have no successor.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createPgGamesRepository } from '../../src/adapters/pg/games-repository'
import { createPgDatabaseProbe } from '../../src/adapters/pg/probe'
import { validationFailedSchema } from '../../src/contract/error'
import {
  INT32_MAX,
  INT32_MIN,
  createGameResponseSchema,
  gameNotFoundSchema,
  roundConflictSchema,
  saveRoundResponseSchema,
  unknownPlayersSchema,
} from '../../src/contract/games'
import { createFixedClock } from '../../src/core/ports/clock.fake'
import { createRecordingLogger } from '../../src/core/ports/logger.fake'
import { createInternalApp } from '../../src/http/internal-app'
import { createTestDatabase } from '../support/pglite'
import { seedUsers } from '../support/seed'

const TOKEN = 'test-internal-token'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Result = { playerId: string; score: number }

let database: Awaited<ReturnType<typeof createTestDatabase>>
let app: ReturnType<typeof createInternalApp>

beforeAll(async () => {
  database = await createTestDatabase()
  const { db } = database
  app = createInternalApp({
    logger: createRecordingLogger().logger,
    clock: createFixedClock(),
    database: createPgDatabaseProbe(db),
    games: createPgGamesRepository(db),
    internalTokens: [TOKEN],
  })
})

afterAll(async () => {
  await database.close()
})

beforeEach(async () => {
  const { db } = database
  await db.deleteFrom('round_users').execute()
  await db.deleteFrom('rounds').execute()
  await db.deleteFrom('games').execute()
  await db.deleteFrom('users').execute()
  await seedUsers(
    db,
    ['alice', 'bob'].map(sub => ({ sub, accountType: 'full', displayName: sub, avatarUrl: null })),
  )
})

const auth = { authorization: `Bearer ${TOKEN}` }

const createGame = async (): Promise<string> => {
  const res = await app.request('/internal/games', { method: 'POST', headers: auth })
  expect(res.status).toBe(201)
  return createGameResponseSchema.parse(await res.json()).id
}

const postRound = (gameId: string, body: unknown) =>
  app.request(`/internal/games/${gameId}/rounds`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

const saveRound = async (gameId: string, results: Result[], roundId: string = crypto.randomUUID()) => {
  const res = await postRound(gameId, { roundId, results })
  expect(res.status).toBe(200)
  return saveRoundResponseSchema.parse(await res.json()).gameResults
}

const counts = async () => {
  const { db } = database
  const rounds = await db.selectFrom('rounds').select('id').execute()
  const roundUsers = await db.selectFrom('round_users').select('round_id').execute()
  return { rounds: rounds.length, roundUsers: roundUsers.length }
}

const storedResults = async () => {
  const rows = await database.db.selectFrom('round_users').select(['user_id', 'score']).orderBy('user_id').execute()
  return rows.map(row => ({ playerId: row.user_id, score: row.score }))
}

const expectValidationFailed = async (res: Response, path?: string) => {
  expect(res.status).toBe(400)
  const body = validationFailedSchema.parse(await res.json())
  if (path !== undefined) {
    expect(body.issues.map(issue => issue.path)).toContain(path)
  }
  return body
}

describe('POST /internal/games', () => {
  it('answers 201 with a lowercase uuid', async () => {
    expect(await createGame()).toMatch(UUID)
  })

  it('answers a new id on every call', async () => {
    expect(await createGame()).not.toBe(await createGame())
  })

  it('answers 401 without the token', async () => {
    const res = await app.request('/internal/games', { method: 'POST' })
    expect(res.status).toBe(401)
    expect(await database.db.selectFrom('games').select('id').execute()).toEqual([])
  })
})

describe('POST /internal/games/{id}/rounds', () => {
  it('answers the round score as the game score for a first round', async () => {
    const gameId = await createGame()
    expect(await saveRound(gameId, [{ playerId: 'alice', score: 10 }])).toEqual({ alice: { roundScore: 10, gameScore: 10 } })
  })

  it('accumulates the game score across rounds', async () => {
    const gameId = await createGame()
    await saveRound(gameId, [{ playerId: 'alice', score: 10 }])
    expect(await saveRound(gameId, [{ playerId: 'alice', score: 5 }])).toEqual({ alice: { roundScore: 5, gameScore: 15 } })
  })

  it('answers every player of a round', async () => {
    const gameId = await createGame()
    expect(
      await saveRound(gameId, [
        { playerId: 'alice', score: 7 },
        { playerId: 'bob', score: 3 },
      ]),
    ).toEqual({ alice: { roundScore: 7, gameScore: 7 }, bob: { roundScore: 3, gameScore: 3 } })
  })

  it('answers roundScore 0 for a player absent from this round', async () => {
    const gameId = await createGame()
    await saveRound(gameId, [
      { playerId: 'alice', score: 4 },
      { playerId: 'bob', score: 6 },
    ])
    expect(await saveRound(gameId, [{ playerId: 'alice', score: 1 }])).toEqual({
      alice: { roundScore: 1, gameScore: 5 },
      bob: { roundScore: 0, gameScore: 6 },
    })
  })

  it('answers 404 game_not_found for an unknown game', async () => {
    const res = await postRound(crypto.randomUUID(), { roundId: crypto.randomUUID(), results: [{ playerId: 'alice', score: 1 }] })
    expect(res.status).toBe(404)
    expect(gameNotFoundSchema.parse(await res.json()).error).toBe('game_not_found')
    expect(await counts()).toEqual({ rounds: 0, roundUsers: 0 })
  })

  it('answers 400 validation_failed with an issue at id for a non-uuid game id', async () => {
    const res = await postRound('not-a-uuid', { roundId: crypto.randomUUID(), results: [{ playerId: 'alice', score: 1 }] })
    await expectValidationFailed(res, 'id')
  })

  it.each([
    ['a result without score', { roundId: crypto.randomUUID(), results: [{ playerId: 'alice' }] }, 'results.0.score'],
    [
      'duplicate playerIds',
      {
        roundId: crypto.randomUUID(),
        results: [
          { playerId: 'alice', score: 1 },
          { playerId: 'alice', score: 2 },
        ],
      },
      'results',
    ],
    ['an empty results', { roundId: crypto.randomUUID(), results: [] }, 'results'],
    ['a non-integer score', { roundId: crypto.randomUUID(), results: [{ playerId: 'alice', score: 1.5 }] }, 'results.0.score'],
    ['a missing roundId', { results: [{ playerId: 'alice', score: 1 }] }, 'roundId'],
  ])('answers 400 validation_failed for %s', async (_name, body, path) => {
    const gameId = await createGame()
    await expectValidationFailed(await postRound(gameId, body), path)
    expect(await counts()).toEqual({ rounds: 0, roundUsers: 0 })
  })

  it('answers 400 validation_failed with no issues for a body that is not JSON', async () => {
    const gameId = await createGame()
    const body = await expectValidationFailed(await postRound(gameId, '{'))
    expect(body.issues).toEqual([])
  })

  it('answers 422 unknown_players and saves nothing when a player has no user', async () => {
    const gameId = await createGame()
    const res = await postRound(gameId, {
      roundId: crypto.randomUUID(),
      results: [
        { playerId: 'alice', score: 1 },
        { playerId: 'carol', score: 2 },
      ],
    })
    expect(res.status).toBe(422)
    expect(unknownPlayersSchema.parse(await res.json())).toMatchObject({ error: 'unknown_players', playerIds: ['carol'] })
    expect(await counts()).toEqual({ rounds: 0, roundUsers: 0 })
  })

  it('answers a repeat with identical results with the current totals and keeps one round', async () => {
    const gameId = await createGame()
    const roundId = crypto.randomUUID()
    const results = [
      { playerId: 'alice', score: 7 },
      { playerId: 'bob', score: 3 },
    ]
    const first = await saveRound(gameId, results, roundId)
    expect(await saveRound(gameId, [...results].reverse(), roundId)).toEqual(first)
    expect(await counts()).toEqual({ rounds: 1, roundUsers: 2 })
  })

  it('answers 409 round_conflict for the same round id with other scores and keeps the stored results', async () => {
    const gameId = await createGame()
    const roundId = crypto.randomUUID()
    await saveRound(gameId, [{ playerId: 'alice', score: 7 }], roundId)
    const res = await postRound(gameId, { roundId, results: [{ playerId: 'alice', score: 8 }] })
    expect(res.status).toBe(409)
    expect(roundConflictSchema.parse(await res.json()).error).toBe('round_conflict')
    expect(await storedResults()).toEqual([{ playerId: 'alice', score: 7 }])
  })

  it('answers 409 round_conflict for a round id saved in another game', async () => {
    const first = await createGame()
    const second = await createGame()
    const roundId = crypto.randomUUID()
    const results = [{ playerId: 'alice', score: 7 }]
    await saveRound(first, results, roundId)
    const res = await postRound(second, { roundId, results })
    expect(res.status).toBe(409)
    roundConflictSchema.parse(await res.json())
    expect(await counts()).toEqual({ rounds: 1, roundUsers: 1 })
  })
})

describe('player ids', () => {
  it('answers a player whose id is a property of Object.prototype', async () => {
    await seedUsers(database.db, [{ sub: '__proto__', accountType: 'full', displayName: 'proto', avatarUrl: null }])
    const gameId = await createGame()
    const res = await postRound(gameId, { roundId: crypto.randomUUID(), results: [{ playerId: '__proto__', score: 7 }] })
    expect(res.status).toBe(200)
    // Read without zod, whose record parsing would hide a missing own key behind the same prototype write.
    const { gameResults } = JSON.parse(await res.text()) as { gameResults: Record<string, unknown> }
    expect(Object.keys(gameResults)).toEqual(['__proto__'])
    expect(Object.getOwnPropertyDescriptor(gameResults, '__proto__')?.value).toEqual({ roundScore: 7, gameScore: 7 })
  })

  it('answers 400 validation_failed for a null character in a playerId and writes nothing', async () => {
    const gameId = await createGame()
    await expectValidationFailed(
      await postRound(gameId, { roundId: crypto.randomUUID(), results: [{ playerId: 'alice\u0000', score: 1 }] }),
      'results.0.playerId',
    )
    expect(await counts()).toEqual({ rounds: 0, roundUsers: 0 })
  })
})

describe('uuids in any letter case', () => {
  it('reads both ids as lowercase, so a retry in another spelling is a repeat', async () => {
    const gameId = await createGame()
    const roundId = crypto.randomUUID()
    const results = [{ playerId: 'alice', score: 10 }]
    const first = await saveRound(gameId.toUpperCase(), results, roundId.toUpperCase())
    expect(first).toEqual({ alice: { roundScore: 10, gameScore: 10 } })

    const mixed = (id: string) => [...id].map((char, index) => (index % 2 === 0 ? char.toUpperCase() : char)).join('')
    expect(await saveRound(gameId, results, roundId)).toEqual(first)
    expect(await saveRound(mixed(gameId), results, mixed(roundId))).toEqual(first)

    expect(await counts()).toEqual({ rounds: 1, roundUsers: 1 })
    const rows = await database.db.selectFrom('rounds').select(['id', 'game_id']).execute()
    expect(rows).toEqual([{ id: roundId, game_id: gameId }])
  })
})

describe('score bounds', () => {
  it('saves the bounds of the integer column', async () => {
    const gameId = await createGame()
    expect(
      await saveRound(gameId, [
        { playerId: 'alice', score: INT32_MAX },
        { playerId: 'bob', score: INT32_MIN },
      ]),
    ).toEqual({ alice: { roundScore: INT32_MAX, gameScore: INT32_MAX }, bob: { roundScore: INT32_MIN, gameScore: INT32_MIN } })
    expect(await counts()).toEqual({ rounds: 1, roundUsers: 2 })
  })

  it.each([INT32_MAX + 1, INT32_MIN - 1])('answers 400 for the score %d and writes nothing', async score => {
    const gameId = await createGame()
    await expectValidationFailed(
      await postRound(gameId, { roundId: crypto.randomUUID(), results: [{ playerId: 'alice', score }] }),
      'results.0.score',
    )
    expect(await counts()).toEqual({ rounds: 0, roundUsers: 0 })
  })

  it('answers a game score wider than the column', async () => {
    const gameId = await createGame()
    await saveRound(gameId, [{ playerId: 'alice', score: INT32_MAX }])
    expect(await saveRound(gameId, [{ playerId: 'alice', score: INT32_MAX }])).toEqual({
      alice: { roundScore: INT32_MAX, gameScore: 4294967294 },
    })
  })
})
