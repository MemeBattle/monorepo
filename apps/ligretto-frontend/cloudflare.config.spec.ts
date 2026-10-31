// The Worker of cloudflare.config.ts, evaluated the way `cf build --mode production` does, and the development branch.
import { describe, expect, it } from 'vitest'

import config from './cloudflare.config.ts'

type Evaluated = {
  worker: {
    name: string
    entrypoint?: string
    env?: unknown
    domains?: unknown
    workersDev: boolean
    assets: unknown
    triggers: { type: string; pattern?: string; zone?: string }[]
  }
}

const evaluate = (mode: string | undefined) =>
  (config as unknown as (context: { mode: string | undefined; isPreview: boolean }) => Evaluated)({ mode, isPreview: false }).worker

const production = evaluate('production')
const development = evaluate(undefined)

describe('cloudflare.config.ts in production mode', () => {
  it('is an assets-only Worker: no entrypoint, no bindings, no domain, no workers.dev hostname', () => {
    expect(production.name).toBe('ligretto-frontend')
    expect(production.entrypoint).toBeUndefined()
    expect(production.env).toBeUndefined()
    expect(production.domains).toBeUndefined()
    expect(production.workersDev).toBe(false)
  })

  it('serves the SPA fallback without running Worker code first', () => {
    expect(production.assets).toEqual({ notFoundHandling: 'single-page-application' })
  })

  it('owns only the catch-all route of ligretto.app, which the core routes outrank', () => {
    expect(production.triggers).toEqual([{ type: 'fetch', pattern: 'ligretto.app/*', zone: 'ligretto.app' }])
  })
})

describe('cloudflare.config.ts outside production mode', () => {
  it('declares no route', () => {
    expect(development.triggers).toEqual([])
  })
})
