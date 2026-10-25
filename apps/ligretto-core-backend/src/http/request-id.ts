import { createMiddleware } from 'hono/factory'

import type { Logger } from '../core/ports/logger.ts'
import type { AppEnv } from './types.ts'

/**
 * The request id: `cf-ray` or `x-request-id` when a proxy supplied one, generated otherwise. It is bound into the
 * request's logger and returned in `x-request-id`, so a client's report can be matched to a log line.
 */
export const requestId = (logger: Logger) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const id = c.req.header('cf-ray') || c.req.header('x-request-id') || crypto.randomUUID()
    c.set('requestId', id)
    c.set('logger', logger.child({ requestId: id }))
    await next()
    c.header('x-request-id', id)
  })
