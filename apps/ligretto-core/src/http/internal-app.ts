import { createBaseApp } from './app'
import { registerHealth } from './health'
import type { AppDeps } from './types'

/** The internal API for other services. No CORS: browsers are not its clients. */
export const createInternalApp = (deps: AppDeps) => {
  const app = createBaseApp(deps)
  registerHealth(app, deps)
  return app
}
