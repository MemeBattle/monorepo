import { createRoute } from '@hono/zod-openapi'

import { createCreateGame, createSaveRound } from '../core/games.ts'
import { validationFailedSchema } from '../contract/error.ts'
import {
  createGameResponseSchema,
  gameIdParamsSchema,
  gameNotFoundSchema,
  roundConflictSchema,
  saveRoundRequestSchema,
  saveRoundResponseSchema,
  unknownPlayersSchema,
  type CreateGameResponse,
  type GameNotFound,
  type RoundConflict,
  type SaveRoundResponse,
  type UnknownPlayers,
} from '../contract/games.ts'
import { invalidInternalTokenSchema } from '../contract/internal-auth.ts'
import type { BaseApp } from './app.ts'
import type { InternalAppDeps } from './types.ts'

/** The security scheme of every `/internal` route, registered once in the internal document. */
const SECURITY_SCHEME = 'internalToken'
const security = [{ [SECURITY_SCHEME]: [] }]

const json = <T>(schema: T) => ({ 'application/json': { schema } })

/** Answered by the middleware of `internal-auth.ts`, declared on each route so the generated client types it. */
const invalidToken = { description: 'No configured Authorization: Bearer token', content: json(invalidInternalTokenSchema) }

export const createGameRoute = createRoute({
  method: 'post',
  path: '/internal/games',
  operationId: 'createGame',
  tags: ['games'],
  summary: 'Create a game',
  security,
  responses: {
    201: { description: 'The game was created', content: json(createGameResponseSchema) },
    401: invalidToken,
  },
})

export const saveRoundRoute = createRoute({
  method: 'post',
  path: '/internal/games/{id}/rounds',
  operationId: 'saveRound',
  tags: ['games'],
  summary: "Save a finished round's results and answer the game's totals",
  description:
    'One transaction under the game row lock. A repeat with the same roundId and identical results answers the current totals; a rejection saves nothing.',
  security,
  request: {
    params: gameIdParamsSchema,
    body: { content: json(saveRoundRequestSchema), required: true },
  },
  responses: {
    200: { description: 'The round is saved, now or by an earlier identical submission', content: json(saveRoundResponseSchema) },
    400: { description: 'The request does not match the schema', content: json(validationFailedSchema) },
    401: invalidToken,
    404: { description: 'No game has this id', content: json(gameNotFoundSchema) },
    409: { description: 'The round id exists with another game or other results', content: json(roundConflictSchema) },
    422: { description: 'Some players have no user', content: json(unknownPlayersSchema) },
  },
})

/**
 * `POST /internal/games` and `POST /internal/games/{id}/rounds`. The handlers map the use cases' results to the
 * declared statuses; `satisfies` holds each body to its contract type. The ids arrive lowercase from the schemas.
 */
export const registerGames = (app: BaseApp, deps: InternalAppDeps) => {
  const createGame = createCreateGame({ games: deps.games })
  const saveRound = createSaveRound({ games: deps.games })

  app.openAPIRegistry.registerComponent('securitySchemes', SECURITY_SCHEME, {
    type: 'http',
    scheme: 'bearer',
    description: 'One of the values of LIGRETTO_INTERNAL_API_TOKEN',
  })

  app.openapi(createGameRoute, async c => {
    const { id } = await createGame()
    return c.json({ id } satisfies CreateGameResponse, 201)
  })

  app.openapi(saveRoundRoute, async c => {
    const { id } = c.req.valid('param')
    const { roundId, results } = c.req.valid('json')
    const result = await saveRound(id, roundId, results)
    if (result.ok) {
      return c.json(result.value satisfies SaveRoundResponse, 200)
    }
    switch (result.error) {
      case 'game_not_found':
        return c.json({ error: 'game_not_found', description: 'No game has this id' } satisfies GameNotFound, 404)
      case 'unknown_players':
        return c.json(
          { error: 'unknown_players', description: 'These player ids have no user', playerIds: result.playerIds } satisfies UnknownPlayers,
          422,
        )
      case 'round_conflict':
        return c.json({ error: 'round_conflict', description: 'The round id exists with another game or other results' } satisfies RoundConflict, 409)
    }
  })
}
