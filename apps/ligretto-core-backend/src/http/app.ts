import { OpenAPIHono } from '@hono/zod-openapi'

import { createErrorHandler, notFound, validationHook } from './errors.ts'
import { requestId } from './request-id.ts'
import { requestLog } from './request-log.ts'
import type { AppDeps, AppEnv } from './types.ts'

/** What both apps share: the request id, the request log, the validation hook, the error handler, the 404. */
export const createBaseApp = (deps: AppDeps) => {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
  app.onError(createErrorHandler(deps.logger))
  app.notFound(notFound)
  app.use(requestId(deps.logger))
  app.use(requestLog(deps.clock))
  return app
}

export type BaseApp = ReturnType<typeof createBaseApp>
