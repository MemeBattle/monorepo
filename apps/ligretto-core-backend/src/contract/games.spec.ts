// The isolated contract test: this file imports the contract and zod only.
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  INT32_MAX,
  INT32_MIN,
  createGameResponseSchema,
  gameIdParamsSchema,
  gameNotFoundSchema,
  roundConflictSchema,
  saveRoundRequestSchema,
  saveRoundResponseSchema,
  unknownPlayersSchema,
} from './games'
import { invalidInternalTokenSchema } from './internal-auth'

const ROUND_ID = '6f1c2d4e-8a9b-4c3d-9e2f-1a2b3c4d5e6f'

const body = (overrides: Record<string, unknown> = {}) => ({
  roundId: ROUND_ID,
  results: [
    { playerId: 'alice', score: 10 },
    { playerId: 'bob', score: -3 },
  ],
  ...overrides,
})

const issuePaths = (result: z.ZodSafeParseResult<unknown>) => (result.success ? [] : result.error.issues.map(issue => issue.path.join('.')))

describe('saveRoundRequestSchema', () => {
  it('accepts a valid body', () => {
    expect(saveRoundRequestSchema.parse(body())).toEqual(body())
  })

  it.each([
    ['an empty results', { results: [] }],
    [
      'a duplicate playerId',
      {
        results: [
          { playerId: 'alice', score: 1 },
          { playerId: 'alice', score: 2 },
        ],
      },
    ],
    ['a non-integer score', { results: [{ playerId: 'alice', score: 1.5 }] }],
    ['a result without score', { results: [{ playerId: 'alice' }] }],
    ['an empty playerId', { results: [{ playerId: '', score: 1 }] }],
    ['a missing roundId', { roundId: undefined }],
    ['a non-uuid roundId', { roundId: 'round-1' }],
  ])('rejects %s', (_name, overrides) => {
    expect(saveRoundRequestSchema.safeParse(body(overrides)).success).toBe(false)
  })

  it('accepts the bounds of the integer column', () => {
    const results = [
      { playerId: 'alice', score: INT32_MIN },
      { playerId: 'bob', score: INT32_MAX },
    ]
    expect(saveRoundRequestSchema.parse(body({ results })).results).toEqual(results)
  })

  it.each([INT32_MAX + 1, INT32_MIN - 1])('rejects the score %d with an issue at results.0.score', score => {
    const result = saveRoundRequestSchema.safeParse(body({ results: [{ playerId: 'alice', score }] }))
    expect(issuePaths(result)).toEqual(['results.0.score'])
  })

  it('rejects a null character in a playerId with an issue at results.0.playerId', () => {
    const result = saveRoundRequestSchema.safeParse(body({ results: [{ playerId: 'alice\u0000', score: 1 }] }))
    expect(issuePaths(result)).toEqual(['results.0.playerId'])
  })

  it('reads an uppercase roundId as its lowercase spelling', () => {
    expect(saveRoundRequestSchema.parse(body({ roundId: ROUND_ID.toUpperCase() })).roundId).toBe(ROUND_ID)
  })
})

describe('gameIdParamsSchema', () => {
  it('rejects a non-uuid id', () => {
    expect(issuePaths(gameIdParamsSchema.safeParse({ id: 'not-a-uuid' }))).toEqual(['id'])
  })

  it('reads an uppercase id as its lowercase spelling', () => {
    expect(gameIdParamsSchema.parse({ id: ROUND_ID.toUpperCase() })).toEqual({ id: ROUND_ID })
  })
})

describe('saveRoundResponseSchema', () => {
  it('accepts a gameScore above the range of one round', () => {
    const response = { gameResults: { alice: { roundScore: INT32_MAX, gameScore: 2 * INT32_MAX } } }
    expect(saveRoundResponseSchema.parse(response)).toEqual(response)
  })
})

describe('the error bodies', () => {
  it('require their code and the code-specific fields', () => {
    expect(unknownPlayersSchema.safeParse({ error: 'unknown_players', playerIds: ['carol'] }).success).toBe(true)
    expect(unknownPlayersSchema.safeParse({ error: 'unknown_players', playerIds: [] }).success).toBe(false)
    expect(gameNotFoundSchema.safeParse({ error: 'round_conflict' }).success).toBe(false)
    expect(roundConflictSchema.safeParse({ error: 'round_conflict' }).success).toBe(true)
    expect(invalidInternalTokenSchema.safeParse({ error: 'invalid_internal_token' }).success).toBe(true)
  })
})

it('registers the component ids the OpenAPI document renders', () => {
  const ids = [
    saveRoundRequestSchema,
    saveRoundResponseSchema,
    createGameResponseSchema,
    gameNotFoundSchema,
    unknownPlayersSchema,
    roundConflictSchema,
    invalidInternalTokenSchema,
  ].map(schema => z.globalRegistry.get(schema)?.id)
  expect(ids).toEqual([
    'SaveRoundRequest',
    'SaveRoundResponse',
    'CreateGameResponse',
    'GameNotFound',
    'UnknownPlayers',
    'RoundConflict',
    'InvalidInternalToken',
  ])
})
