import { SESSION_COOKIE_GRACE_MS } from '@memebattle/ligretto-auth'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { z } from 'zod'

import { createConsoleLogger } from '../adapters/console-logger.ts'
import { createPgAuthSweepStore } from '../adapters/pg/auth-sweep-store.ts'
import { createPgGamesRepository } from '../adapters/pg/games-repository.ts'
import { createPgDatabaseProbe } from '../adapters/pg/probe.ts'
import { createPgUsersRepository } from '../adapters/pg/users-repository.ts'
import { systemClock } from '../adapters/system-clock.ts'
import { loadAuthConfig, loadHttpConfig, loadInternalApiConfig, loadLoggingConfig } from '../core/config.ts'
import { createSweepExpiredAuth } from '../core/sweep.ts'
import { createInternalApp } from '../http/internal-app.ts'
import { createPublicApp } from '../http/public-app.ts'
import { createAuth } from './auth.ts'
import { createRequestScopeRunner } from './request-scope.ts'
import { runSweep } from './run-sweep.ts'

/** The bindings declared in cloudflare.config.ts. */
export interface WorkerEnv {
  HYPERDRIVE_MAIN: Hyperdrive
  HYPERDRIVE_LOCKS: Hyperdrive
  LIGRETTO_CORE_PUBLIC_HOST: string
  LIGRETTO_CORE_INTERNAL_HOST: string
  LIGRETTO_CORE_CORS_ORIGINS?: string
  LOG_LEVEL?: string
  /** A secret: `.dev.vars` in development, set on the Worker in production (README.md § First activation). */
  LIGRETTO_INTERNAL_API_TOKEN: string
  CAS_ISSUER: string
  LIGRETTO_CAS_CLIENT_ID: string
  /** A secret, like `LIGRETTO_INTERNAL_API_TOKEN`. */
  LIGRETTO_CAS_CLIENT_SECRET: string
  LIGRETTO_CORE_AUTH_REDIRECT_URI: string
  LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: string
  LIGRETTO_CORE_AUTH_APP_URL: string
  LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: string
  /** A secret nothing here reads: the Worker connects only through the Hyperdrive bindings. */
  DATABASE_URL: string
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
  // Not `loadConfig`: its database section is DATABASE_URL, a secret this Worker has and does not connect with. The
  // Hyperdrive bindings stand in for it.
  const authConfig = loadAuthConfig(env as unknown as Record<string, unknown>)
  const logger = createConsoleLogger({ level: logging.level })
  // One database per handle for the isolate; each request gets its own clients through the runner's scope.
  const runner = createRequestScopeRunner()
  const deps = { logger, clock: systemClock, database: createPgDatabaseProbe(runner.handles.main) }
  // The session store takes its locks on the scoped `locks` handle and everything else on `main`.
  const { handlers, verifyAccessToken } = createAuth({ config: authConfig, databases: runner.handles, clock: systemClock })
  return {
    runner,
    logger,
    // Each candidate takes one lock transaction on the scoped `locks` handle beside statements on `main`.
    sweep: createSweepExpiredAuth({
      store: createPgAuthSweepStore(runner.handles),
      clock: systemClock,
      logger,
      sessionRetentionMs: SESSION_COOKIE_GRACE_MS,
    }),
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
const inScope = <T>(apps: ReturnType<typeof build>, env: WorkerEnv, ctx: ExecutionContext, handle: () => T | Promise<T>): Promise<T> =>
  apps.runner.run(
    { main: env.HYPERDRIVE_MAIN.connectionString, locks: env.HYPERDRIVE_LOCKS.connectionString },
    promise => ctx.waitUntil(promise),
    async () => handle(),
  )

export default {
  /**
   * Dispatch on the hostname of the request URL, which workerd builds from the `Host` header of real traffic (the
   * test pool's requests carry no `Host` header, only the URL). The routes of cloudflare.config.ts deliver
   * `Host: ligretto.app` and the Custom Domain `Host: core-internal.ligretto.app`.
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

  /** The cron trigger of cloudflare.config.ts. A failed sweep rejects, so Cron Events records an exception. */
  scheduled(_controller, env, ctx) {
    const apps = compose(env)
    return inScope(apps, env, ctx, () => runSweep({ sweep: apps.sweep, logger: apps.logger }))
  },
} satisfies ExportedHandler<WorkerEnv>

/** The internal app for service bindings from other Workers. */
export class InternalApi extends WorkerEntrypoint<WorkerEnv> {
  override fetch(request: Request): Promise<Response> {
    const apps = compose(this.env)
    return inScope(apps, this.env, this.ctx, () => apps.internal.fetch(request, this.env, this.ctx))
  }
}
