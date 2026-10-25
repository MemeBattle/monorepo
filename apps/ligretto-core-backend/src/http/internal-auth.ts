import { createMiddleware } from 'hono/factory'
import { timingSafeEqual } from 'hono/utils/buffer'

import type { InvalidInternalToken } from '../contract/internal-auth.ts'
import { bearerTokenOf } from './bearer.ts'
import type { AppEnv } from './types.ts'

/**
 * The shared secret of the internal API (docs/adrs/internal-api-and-service-authentication.md): the bearer token
 * must be one of the one or two configured values. Every value is compared, without an early exit, in constant time
 * (`timingSafeEqual` hashes both sides first, so lengths do not leak either). The refusal is answered here rather than
 * through `HTTPException`, whose 401 code is the public `unauthorized`. The presented token is never logged.
 */
export const internalAuth = (tokens: readonly string[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const presented = bearerTokenOf(c.req.header('authorization'))
    let accepted = false
    if (presented !== undefined) {
      for (const token of tokens) {
        // Not `accepted ||= …`: that would skip the comparisons after a match.
        const match = await timingSafeEqual(presented, token)
        accepted = accepted || match
      }
    }
    if (!accepted) {
      c.header('www-authenticate', 'Bearer')
      return c.json(
        {
          error: 'invalid_internal_token',
          description: 'A valid Authorization: Bearer token for the internal API is required',
        } satisfies InvalidInternalToken,
        401,
      )
    }
    await next()
  })
