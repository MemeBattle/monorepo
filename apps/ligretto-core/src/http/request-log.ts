import { createMiddleware } from 'hono/factory'

import type { Clock } from '../core/ports/clock'
import type { AppEnv } from './types'

/** One line per request on completion (docs/adrs/logging.md): no query string, no headers, no body. */
export const requestLog = (clock: Clock) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const startedAt = clock.now()
    await next()
    c.get('logger').info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: clock.now() - startedAt,
      requestId: c.get('requestId'),
    })
  })
