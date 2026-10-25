import type { Hook } from '@hono/zod-openapi'
import type { ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import type { Logger } from '../core/ports/logger.ts'
import type { ErrorResponse, InternalError, ValidationFailed } from '../contract/error.ts'
import type { AppEnv } from './types.ts'

/**
 * The envelope on the failures no route handler sees (docs/adrs/error-responses.md): schema rejections, the
 * `HTTPException`s thrown by Hono and its middleware, anything else thrown, and unknown routes.
 */

/** The `defaultHook` of both apps: a schema rejection is `400 validation_failed` with the issues. */
export const validationHook: Hook<unknown, AppEnv, string, Response | undefined> = (result, c) => {
  if (result.success) {
    return undefined
  }
  const body: ValidationFailed = {
    error: 'validation_failed',
    description: 'The request does not match the route schema',
    issues: result.error.issues.map(issue => ({ path: issue.path.map(String).join('.'), message: issue.message, code: issue.code })),
  }
  return c.json(body, 400)
}

/**
 * The fallback code of an `HTTPException` by its status. A route that knows which dependency failed answers its own
 * code (`database_unavailable`, `cas_unavailable`, …) from the handler; these are for what reaches the error handler.
 */
const CODE_BY_STATUS: Partial<Record<number, string>> = {
  400: 'validation_failed',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limit_exceeded',
  502: 'bad_gateway',
  503: 'service_unavailable',
  504: 'gateway_timeout',
}

const codeForStatus = (status: number): string => CODE_BY_STATUS[status] ?? (status < 500 ? 'request_rejected' : 'internal_error')

/**
 * The `onError` of both apps. Every `HTTPException` keeps its status and gets the code of that status; its own `res`,
 * if it carries one, is not passed through. A deliberate 500 and anything that is not an `HTTPException` are the one
 * `500 internal_error` with the request id. Every 5xx is logged at `error` with the code and the stack; a 4xx is an
 * expected refusal and is logged by the request line alone (docs/adrs/logging.md).
 */
export const createErrorHandler =
  (fallbackLogger: Logger): ErrorHandler<AppEnv> =>
  (err, c) => {
    const requestId = c.get('requestId') ?? 'unknown'
    const logger = c.get('logger') ?? fallbackLogger
    const status: ContentfulStatusCode = err instanceof HTTPException ? err.status : 500
    const code = codeForStatus(status)

    if (status >= 500) {
      logger.error('request_failed', {
        requestId,
        status: code === 'internal_error' ? 500 : status,
        error: code,
        errorMessage: err.message,
        stack: err.stack,
      })
    }

    if (code === 'internal_error') {
      const body: InternalError = { error: 'internal_error', description: 'Unexpected failure', requestId }
      return c.json(body, 500)
    }

    const description = err.message === '' ? undefined : err.message
    if (code === 'validation_failed') {
      // A body that cannot be parsed never reached a schema, so there are no issues to list.
      const body: ValidationFailed = { error: 'validation_failed', description, issues: [] }
      return c.json(body, status)
    }
    const body: ErrorResponse = { error: code, description }
    return c.json(body, status)
  }

export const notFound: NotFoundHandler<AppEnv> = c => {
  const body: ErrorResponse = { error: 'not_found' }
  return c.json(body, 404)
}
