import { createRoute } from '@hono/zod-openapi'

import { createListUsers } from '../core/users'
import { validationFailedSchema } from '../contract/error'
import { casUnavailableSchema, listUsersQuerySchema, listUsersResponseSchema, unauthorizedSchema, type ListUsersResponse } from '../contract/users'
import { accessToken } from './access-token'
import type { BaseApp } from './app'
import type { PublicAppDeps } from './types'

/** The security scheme of the public routes that take a CAS access token, registered once in the public document. */
const SECURITY_SCHEME = 'accessToken'

const json = <T>(schema: T) => ({ 'application/json': { schema } })

export const listUsersRoute = createRoute({
  method: 'get',
  path: '/api/users',
  operationId: 'listUsers',
  tags: ['users'],
  summary: 'The profile snapshots of some users',
  description: 'The latest snapshot of each requested id that has one: unknown ids are absent and the order is not promised.',
  security: [{ [SECURITY_SCHEME]: [] }],
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

  app.openAPIRegistry.registerComponent('securitySchemes', SECURITY_SCHEME, {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'A CAS access token (RFC 9068) with aud ligretto, the accessToken that GET /api/auth/me answers',
  })

  app.use(listUsersRoute.path, accessToken(deps.verifyAccessToken))

  app.openapi(listUsersRoute, async c => {
    const { ids } = c.req.valid('query')
    const profiles = await listUsers(ids)
    const body = profiles.map(({ sub, accountType, displayName, avatarUrl }) => ({ sub, accountType, name: displayName, avatarUrl }))
    return c.json(body satisfies ListUsersResponse, 200)
  })
}
