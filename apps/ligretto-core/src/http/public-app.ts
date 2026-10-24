import { cors } from 'hono/cors'

import { createBaseApp } from './app'
import { registerHealth } from './health'
import type { AppDeps } from './types'

/**
 * The public API. CORS is credentialed for the configured origins and nothing else: an exact match, so
 * `http://localhost.attacker.example` is not `http://localhost`.
 */
export const createPublicApp = (deps: AppDeps) => {
  const corsOrigins = deps.corsOrigins ?? []
  const app = createBaseApp(deps)
  app.use(
    cors({
      origin: origin => (corsOrigins.includes(origin) ? origin : null),
      credentials: true,
      allowHeaders: ['Authorization', 'Content-Type'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  )
  registerHealth(app, deps)
  return app
}
