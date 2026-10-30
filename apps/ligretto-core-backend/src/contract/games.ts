import { z } from 'zod'

import { errorResponseSchema } from './error.ts'

/** The range of the Postgres `integer` column `round_users.score`. */
export const INT32_MIN = -2147483648
export const INT32_MAX = 2147483647

/**
 * The canonical form of every id this API accepts. zod accepts a uuid in any letter case and Postgres returns it in
 * lowercase, so without the normalisation a retry spelled in another case would compare unequal and be a `409`.
 */
const uuidSchema = z.uuid().toLowerCase()

/**
 * A round score, bounded to the column so an out-of-range value is a `400`, never a database error. Not `z.int32()`:
 * it validates the same but renders as a bare `number` in the OpenAPI document.
 */
const scoreSchema = z.int().min(INT32_MIN).max(INT32_MAX).meta({ description: 'A signed 32-bit integer, the range of the Postgres integer column' })

export const gameIdParamsSchema = z.object({
  id: uuidSchema.meta({ description: 'The game id; any letter case, read as lowercase' }),
})

export const createGameResponseSchema = z
  .object({
    id: z.uuid(),
  })
  .meta({ id: 'CreateGameResponse', description: 'The game just created' })

const roundResultSchema = z.object({
  // Postgres text cannot hold U+0000, so the lookup would fail with a database error rather than a 400.
  playerId: z
    .string()
    .min(1)
    .refine(id => !id.includes('\u0000'), { message: 'playerId must not contain the null character' })
    .meta({ description: 'The CAS subject of the player' }),
  score: scoreSchema,
})

export const saveRoundRequestSchema = z
  .object({
    roundId: uuidSchema.meta({ description: 'Minted by the caller once per round and kept, with the results, across retries' }),
    results: z
      .array(roundResultSchema)
      .min(1)
      .refine(results => new Set(results.map(result => result.playerId)).size === results.length, {
        message: 'playerId values must be distinct',
      }),
  })
  .meta({ id: 'SaveRoundRequest', description: "A finished round's results" })

export const saveRoundResponseSchema = z
  .object({
    gameResults: z.record(
      z.string(),
      z.object({
        roundScore: scoreSchema,
        // Unbounded on purpose: the sum of several rounds exceeds the range of one round's score.
        gameScore: z.int(),
      }),
    ),
  })
  .meta({
    id: 'SaveRoundResponse',
    description: "Every player of every round of the game: the sum of their scores so far and this round's score, or 0",
  })

export const gameNotFoundSchema = errorResponseSchema
  .extend({ error: z.literal('game_not_found') })
  .meta({ id: 'GameNotFound', description: 'No game has this id' })

export const unknownPlayersSchema = errorResponseSchema
  .extend({
    error: z.literal('unknown_players'),
    playerIds: z.array(z.string()).min(1),
  })
  .meta({ id: 'UnknownPlayers', description: 'These player ids have no user; nothing was saved' })

export const roundConflictSchema = errorResponseSchema
  .extend({ error: z.literal('round_conflict') })
  .meta({ id: 'RoundConflict', description: 'The round id exists with another game or other results; nothing was saved' })

export type GameIdParams = z.output<typeof gameIdParamsSchema>
export type CreateGameResponse = z.infer<typeof createGameResponseSchema>
export type SaveRoundRequest = z.output<typeof saveRoundRequestSchema>
export type SaveRoundResponse = z.infer<typeof saveRoundResponseSchema>
export type GameNotFound = z.infer<typeof gameNotFoundSchema>
export type UnknownPlayers = z.infer<typeof unknownPlayersSchema>
export type RoundConflict = z.infer<typeof roundConflictSchema>
