import { createRoute } from '@hono/zod-openapi'

import { createListUsers } from '../core/users.ts'
import { validationFailedSchema } from '../contract/error.ts'
import { casUnavailableSchema, listUsersQuerySchema, listUsersResponseSchema, unauthorizedSchema, type ListUsersResponse } from '../contract/users.ts'
import { ACCESS_TOKEN_SCHEME, accessToken } from './access-token.ts'
import type { BaseApp } from './app.ts'
import type { PublicAppDeps } from './types.ts'

const json = <T>(schema: T) => ({ 'application/json': { schema } })

const listUsersRoute = createRoute({
  method: 'get',
  path: '/api/users',
  operationId: 'listUsers',
  tags: ['users'],
  summary: 'The profile snapshots of some users',
  description: 'The latest snapshot of each requested id that has one: unknown ids are absent and the order is not promised.',
  security: [{ [ACCESS_TOKEN_SCHEME]: [] }],
  request: { query: listUsersQuerySchema },
  responses: {
    200: { description: 'The snapshot of each known id', content: json(listUsersResponseSchema) },
    400: { description: 'The query does not match the schema', content: json(validationFailedSchema) },
    401: { description: 'No CAS access token this service accepts', content: json(unauthorizedSchema) },
    503: { description: "CAS's metadata could not be read to verify the access token", content: json(casUnavailableSchema) },
  },
})

/**
 * `GET /api/users`. The access-token middleware runs first, so a refused token is a 401 even for a malformed query.
 * The handler maps the core's `UserProfile` to the contract's `AuthUser`; `satisfies` holds the two together.
 */
export const registerUsers = (app: BaseApp, deps: PublicAppDeps) => {
  const listUsers = createListUsers({ users: deps.users })

  app.use(listUsersRoute.path, accessToken(deps.verifyAccessToken))

  app.openapi(listUsersRoute, async c => {
    const { ids } = c.req.valid('query')
    const profiles = await listUsers(ids)
    const body = profiles.map(({ sub, accountType, displayName, avatarUrl }) => ({ sub, accountType, name: displayName, avatarUrl }))
    return c.json(body satisfies ListUsersResponse, 200)
  })
}
