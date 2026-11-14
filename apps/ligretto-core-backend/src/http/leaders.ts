import { createRoute } from '@hono/zod-openapi'

import { createListLeaders } from '../core/leaders.ts'
import type { Leader } from '../core/ports/leaders-repository.ts'
import { validationFailedSchema } from '../contract/error.ts'
import { LEADERS_LIMIT, leaderboardSchema, listLeadersQuerySchema, type Leaderboard } from '../contract/leaders.ts'
import { casUnavailableSchema, unauthorizedSchema } from '../contract/users.ts'
import { ACCESS_TOKEN_SCHEME, accessToken } from './access-token.ts'
import type { BaseApp } from './app.ts'
import type { PublicAppDeps } from './types.ts'

const json = <T>(schema: T) => ({ 'application/json': { schema } })

const listLeadersRoute = createRoute({
  method: 'get',
  path: '/api/leaders',
  operationId: 'listLeaders',
  tags: ['leaders'],
  summary: 'The leaderboard of a period',
  description:
    'The full accounts ranked by the points of their rounds in the period, the first ' +
    `${LEADERS_LIMIT} of them, and the caller's own row wherever it ranks. Names and avatars are the latest snapshots.`,
  security: [{ [ACCESS_TOKEN_SCHEME]: [] }],
  request: { query: listLeadersQuerySchema },
  responses: {
    200: { description: 'The ranking and the caller in it', content: json(leaderboardSchema) },
    400: { description: 'The query does not match the schema', content: json(validationFailedSchema) },
    401: { description: 'No CAS access token this service accepts', content: json(unauthorizedSchema) },
    503: { description: "CAS's metadata could not be read to verify the access token", content: json(casUnavailableSchema) },
  },
})

const toContract = ({ sub, displayName, avatarUrl, points, place }: Leader) => ({ sub, name: displayName, avatarUrl, totalPoints: points, place })

/**
 * `GET /api/leaders`. The access-token middleware runs first, so a refused token is a 401 even for a malformed query,
 * and it hands the route the caller's verified claims.
 */
export const registerLeaders = (app: BaseApp, deps: PublicAppDeps) => {
  const listLeaders = createListLeaders({ leaders: deps.leaders, clock: deps.clock, limit: LEADERS_LIMIT })

  app.use(listLeadersRoute.path, accessToken(deps.verifyAccessToken))

  app.openapi(listLeadersRoute, async c => {
    const claims = c.get('accessTokenClaims')
    if (claims === undefined) {
      throw new Error('the access-token middleware did not run')
    }
    const { period } = c.req.valid('query')
    const { leaders, me } = await listLeaders(period, claims.sub)
    const body = { leaders: leaders.map(toContract), me: me === null ? null : toContract(me) }
    return c.json(body satisfies Leaderboard, 200)
  })
}
