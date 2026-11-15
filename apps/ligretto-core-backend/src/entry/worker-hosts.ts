import { z } from 'zod'

import { commaList } from '../core/config.ts'

const hostname = z.string().regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/, {
  message: 'Expected a bare lowercase hostname (no scheme, port or path), such as ligretto.app',
})

/**
 * Deployment topology of the Worker, so not part of the service's `Config`: the hostnames the public app answers on,
 * every public route on each of them, and the hostname of the internal app.
 */
const workerHostsSchema = z
  .object({
    LIGRETTO_CORE_PUBLIC_HOSTS: commaList(hostname).pipe(z.array(z.string()).min(1)),
    LIGRETTO_CORE_INTERNAL_HOST: z.string().min(1),
  })
  .superRefine((env, ctx) => {
    const seen = new Set<string>()
    for (const host of env.LIGRETTO_CORE_PUBLIC_HOSTS) {
      if (seen.has(host)) {
        ctx.addIssue({ code: 'custom', path: ['LIGRETTO_CORE_PUBLIC_HOSTS'], message: `${host} is listed twice` })
      }
      seen.add(host)
    }
    if (seen.has(env.LIGRETTO_CORE_INTERNAL_HOST)) {
      ctx.addIssue({
        code: 'custom',
        path: ['LIGRETTO_CORE_PUBLIC_HOSTS'],
        message: `${env.LIGRETTO_CORE_INTERNAL_HOST} is the internal host and cannot be public`,
      })
    }
  })
  .transform(env => ({
    publicHosts: new Set(env.LIGRETTO_CORE_PUBLIC_HOSTS) as ReadonlySet<string>,
    internalHost: env.LIGRETTO_CORE_INTERNAL_HOST,
  }))

/** Throws on an invalid list, so a misconfigured Worker fails when it composes, not on some later request. */
export const parseWorkerHosts = (env: Record<string, unknown>) => workerHostsSchema.parse(env)
