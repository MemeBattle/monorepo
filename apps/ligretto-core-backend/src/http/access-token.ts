import { DiscoveryError, InvalidTokenError } from '@memebattle/ligretto-auth'
import { createMiddleware } from 'hono/factory'

import type { CasUnavailable, Unauthorized } from '../contract/users.ts'
import { bearerTokenOf } from './bearer.ts'
import type { AppEnv, PublicAppDeps } from './types.ts'

/**
 * The CAS access token of a public route (docs/adrs/api-contract-openapi-and-client-package.md): an
 * `Authorization: Bearer` token `verify` accepts. Installed before the route, so a refusal comes before the query is
 * validated and before any use case runs.
 *
 * No token, or one `verify` refuses (`InvalidTokenError`), is `401 unauthorized` with `WWW-Authenticate: Bearer`.
 * CAS's metadata that cannot be read (`DiscoveryError`) is `503 cas_unavailable`: the token was never judged, so it
 * is not an invalid credential, and it is logged once at `error` with the `DiscoveryError`'s code, as the error handler
 * logs a 5xx it answers. Anything else is a bug and reaches the error handler as the one 500. The refusals are
 * answered here rather than through `HTTPException`, so they carry their own description. The token is never logged,
 * and nothing is put on the context: no route reads the claims yet.
 */
export const accessToken = (verify: PublicAppDeps['verifyAccessToken']) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const unauthorized = () => {
      c.header('www-authenticate', 'Bearer')
      return c.json({ error: 'unauthorized', description: 'A valid CAS access token for this service is required' } satisfies Unauthorized, 401)
    }

    const token = bearerTokenOf(c.req.header('authorization'))
    if (token === undefined) {
      return unauthorized()
    }
    try {
      await verify(token)
    } catch (failure) {
      if (failure instanceof InvalidTokenError) {
        return unauthorized()
      }
      if (failure instanceof DiscoveryError) {
        c.get('logger').error('request_failed', {
          requestId: c.get('requestId'),
          status: 503,
          error: 'cas_unavailable',
          reason: failure.code,
          errorMessage: failure.message,
        })
        return c.json(
          { error: 'cas_unavailable', description: "CAS's metadata could not be read to verify the access token" } satisfies CasUnavailable,
          503,
        )
      }
      throw failure
    }
    await next()
  })
