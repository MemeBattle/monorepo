import { WorkerEntrypoint } from 'cloudflare:workers'
import { z } from 'zod'

import { createConsoleLogger } from '../adapters/console-logger'
import { stubDatabaseProbe } from '../adapters/stub-database-probe'
import { systemClock } from '../adapters/system-clock'
import { loadHttpConfig, loadLoggingConfig } from '../core/config'
import { createInternalApp } from '../http/internal-app'
import { createPublicApp } from '../http/public-app'

/** The bindings declared in cloudflare.config.ts. */
export interface WorkerEnv {
  HYPERDRIVE_MAIN: Hyperdrive
  HYPERDRIVE_LOCKS: Hyperdrive
  LIGRETTO_CORE_PUBLIC_HOST: string
  LIGRETTO_CORE_INTERNAL_HOST: string
  LIGRETTO_CORE_CORS_ORIGINS?: string
  LOG_LEVEL?: string
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
  const logger = createConsoleLogger({ level: logging.level })
  const deps = { logger, clock: systemClock, database: stubDatabaseProbe }
  return {
    publicHost: hosts.LIGRETTO_CORE_PUBLIC_HOST,
    internalHost: hosts.LIGRETTO_CORE_INTERNAL_HOST,
    public: createPublicApp({ ...deps, corsOrigins: http.corsOrigins }),
    internal: createInternalApp(deps),
  }
}

// The bindings of a Worker do not change between requests, so the apps are composed once per isolate.
let composed: ReturnType<typeof build> | undefined
const compose = (env: WorkerEnv) => (composed ??= build(env))

export default {
  /**
   * Dispatch on the hostname of the request URL, which workerd builds from the `Host` header of real traffic (the
   * test pool's requests carry no `Host` header, only the URL).
   */
  fetch(request, env, ctx) {
    const apps = compose(env)
    const { hostname } = new URL(request.url)
    if (hostname === apps.publicHost) {
      return apps.public.fetch(request, env, ctx)
    }
    if (hostname === apps.internalHost) {
      return apps.internal.fetch(request, env, ctx)
    }
    return Response.json({ error: 'unknown_host' }, { status: 404 })
  },
} satisfies ExportedHandler<WorkerEnv>

/** The internal app for service bindings from other Workers. */
export class InternalApi extends WorkerEntrypoint<WorkerEnv> {
  override fetch(request: Request): Response | Promise<Response> {
    return compose(this.env).internal.fetch(request, this.env, this.ctx)
  }
}
