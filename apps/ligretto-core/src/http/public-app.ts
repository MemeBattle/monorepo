import { createMiddleware } from 'hono/factory'
import { cors } from 'hono/cors'

import { createBaseApp } from './app'
import { registerAuth } from './auth'
import { registerHealth } from './health'
import { publicApiDocument } from './openapi'
import type { AppEnv, PublicAppDeps } from './types'
import { registerUsers } from './users'

/**
 * Credentialed CORS for the configured origins and nothing else: an exact match, so
 * `http://localhost.attacker.example` is not `http://localhost`. `hono/cors` alone would send
 * `Access-Control-Allow-Credentials: true` to every origin, so it runs only for a configured one; any other request
 * gets no CORS header at all, and a preflight from a refused origin falls through to routing.
 */
const allowedOrigins = (origins: readonly string[]) => {
  const credentialed = cors({
    origin: origin => origin,
    credentials: true,
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })
  return createMiddleware<AppEnv>(async (c, next) => {
    const origin = c.req.header('origin')
    if (origin !== undefined && origins.includes(origin)) {
      return credentialed(c, next)
    }
    await next()
  })
}

/**
 * The public API: `/health`, the four auth routes of `@memebattle/ligretto-auth`, `GET /api/users` behind a CAS
 * access token, and `GET /openapi.json`, which serves the document of every route registered before it. The document
 * is computed once, on the first request, and does not describe `/openapi.json` itself.
 */
export const createPublicApp = (deps: PublicAppDeps) => {
  const app = createBaseApp(deps)
  app.use(allowedOrigins(deps.corsOrigins ?? []))
  registerHealth(app, deps)
  registerAuth(app, deps)
  registerUsers(app, deps)

  let document: ReturnType<typeof publicApiDocument> | undefined
  app.get('/openapi.json', c => c.json((document ??= publicApiDocument(app))))
  return app
}
