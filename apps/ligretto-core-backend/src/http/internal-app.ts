import { createBaseApp } from './app'
import { registerGames } from './games'
import { registerHealth } from './health'
import { internalAuth } from './internal-auth'
import type { InternalAppDeps } from './types'

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
