import { createBaseApp } from './app.ts'
import { registerGames } from './games.ts'
import { registerHealth } from './health.ts'
import { internalAuth } from './internal-auth.ts'
import type { InternalAppDeps } from './types.ts'

/**
 * The internal API for other services. No CORS: browsers are not its clients. `/health` stays open as the liveness
 * check; the shared secret guards everything under `/internal`, mounted before the routes so a refused request never
 * reaches a use case.
 */
export const createInternalApp = (deps: InternalAppDeps) => {
  const app = createBaseApp(deps)
  registerHealth(app, deps)
  app.use('/internal/*', internalAuth(deps.internalTokens))
  registerGames(app, deps)
  return app
}
