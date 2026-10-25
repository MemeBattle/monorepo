import { WorkerEntrypoint } from 'cloudflare:workers'
import { z } from 'zod'

import { createConsoleLogger } from '../adapters/console-logger'
import { createPgGamesRepository } from '../adapters/pg/games-repository'
import { createPgDatabaseProbe } from '../adapters/pg/probe'
import { createPgUsersRepository } from '../adapters/pg/users-repository'
import { systemClock } from '../adapters/system-clock'
import { loadAuthConfig, loadHttpConfig, loadInternalApiConfig, loadLoggingConfig } from '../core/config'
import { createInternalApp } from '../http/internal-app'
import { createPublicApp } from '../http/public-app'
import { createAuth } from './auth'
import { createRequestScopeRunner } from './request-scope'

/** The bindings declared in cloudflare.config.ts. */
export interface WorkerEnv {
  HYPERDRIVE_MAIN: Hyperdrive
  HYPERDRIVE_LOCKS: Hyperdrive
  LIGRETTO_CORE_PUBLIC_HOST: string
  LIGRETTO_CORE_INTERNAL_HOST: string
  LIGRETTO_CORE_CORS_ORIGINS?: string
  LOG_LEVEL?: string
  /** A secret: `.dev.vars` in development, `cf deploy --secrets-file` in production (#843). */
  LIGRETTO_INTERNAL_API_TOKEN: string
  CAS_ISSUER: string
  LIGRETTO_CAS_CLIENT_ID: string
  /** A secret, like `LIGRETTO_INTERNAL_API_TOKEN`. */
  LIGRETTO_CAS_CLIENT_SECRET: string
  LIGRETTO_CORE_AUTH_REDIRECT_URI: string
  LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: string
  LIGRETTO_CORE_AUTH_APP_URL: string
  LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: string
}

/** Which hostname reaches which app: the deployment topology of this runtime, not part of the service's `Config`. */
const hostsSchema = z.object({
  LIGRETTO_CORE_PUBLIC_HOST: z.string().min(1),
  LIGRETTO_CORE_INTERNAL_HOST: z.string().min(1),
})

const build = (env: WorkerEnv) => {
  const hosts = hostsSchema.parse(env)
  const http = loadHttpConfig(env as unknown as Record<string, unknown>)
  const logging = loadLoggingConfig(env as unknown as Record<string, unknown>)
  const internalApi = loadInternalApiConfig(env as unknown as Record<string, unknown>)
  // Not `loadConfig`: there is no DATABASE_URL on Workers, the Hyperdrive bindings stand in for it.
  const authConfig = loadAuthConfig(env as unknown as Record<string, unknown>)
  const logger = createConsoleLogger({ level: logging.level })
  // One database per handle for the isolate; each request gets its own clients through the runner's scope.
  const runner = createRequestScopeRunner()
  const deps = { logger, clock: systemClock, database: createPgDatabaseProbe(runner.handles.main) }
  // The session store takes its locks on the scoped `locks` handle and everything else on `main`.
  const { handlers, verifyAccessToken } = createAuth({ config: authConfig, databases: runner.handles, clock: systemClock })
  return {
    runner,
    publicHost: hosts.LIGRETTO_CORE_PUBLIC_HOST,
    internalHost: hosts.LIGRETTO_CORE_INTERNAL_HOST,
    public: createPublicApp({
      ...deps,
      corsOrigins: http.corsOrigins,
      auth: handlers,
      users: createPgUsersRepository(runner.handles.main),
      verifyAccessToken,
    }),
    // The scoped `main` handle runs the transaction and every statement of the locked game on the request's one client.
    internal: createInternalApp({ ...deps, games: createPgGamesRepository(runner.handles.main), internalTokens: internalApi.tokens }),
  }
}

// The bindings of a Worker do not change between requests, so the apps are composed once per isolate.
let composed: ReturnType<typeof build> | undefined
const compose = (env: WorkerEnv) => (composed ??= build(env))

/** Runs `handle` in a request scope on the two Hyperdrive bindings; the clients close in `waitUntil`. */
const inScope = (
  apps: ReturnType<typeof build>,
  env: WorkerEnv,
  ctx: ExecutionContext,
  handle: () => Response | Promise<Response>,
): Promise<Response> =>
  apps.runner.run(
    { main: env.HYPERDRIVE_MAIN.connectionString, locks: env.HYPERDRIVE_LOCKS.connectionString },
    promise => ctx.waitUntil(promise),
    async () => handle(),
  )

export default {
  /**
   * Dispatch on the hostname of the request URL, which workerd builds from the `Host` header of real traffic (the
   * test pool's requests carry no `Host` header, only the URL).
   */
  fetch(request, env, ctx) {
    const apps = compose(env)
    const { hostname } = new URL(request.url)
    // A foreign host needs no database, but one code path is simpler than two; an unused scope opens nothing.
    return inScope(apps, env, ctx, () => {
      if (hostname === apps.publicHost) {
        return apps.public.fetch(request, env, ctx)
      }
      if (hostname === apps.internalHost) {
        return apps.internal.fetch(request, env, ctx)
      }
      return Response.json({ error: 'unknown_host' }, { status: 404 })
    })
  },
} satisfies ExportedHandler<WorkerEnv>

/** The internal app for service bindings from other Workers. */
export class InternalApi extends WorkerEntrypoint<WorkerEnv> {
  override fetch(request: Request): Promise<Response> {
    const apps = compose(this.env)
    return inScope(apps, this.env, this.ctx, () => apps.internal.fetch(request, this.env, this.ctx))
  }
}
