// The production values of cloudflare.config.ts, evaluated the way `cf build --mode production` does, and the
// development branch `cf dev` and the Worker suite rely on.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { loadAuthConfig, loadHttpConfig } from '../src/core/config.ts'
import config from '../cloudflare.config.ts'

type Binding = { type: string; id?: string; value?: string }
type Evaluated = {
  worker: {
    compatibilityDate: string
    domains: string[]
    workersDev: boolean
    triggers: { type: string; pattern?: string; zone?: string }[]
    assets?: unknown
    env: Record<string, Binding>
  }
}

const evaluate = (mode: string | undefined) =>
  (config as unknown as (context: { mode: string | undefined; isPreview: boolean }) => Evaluated)({ mode, isPreview: false }).worker

const production = evaluate('production')
const development = evaluate(undefined)

const text = (worker: Evaluated['worker']) =>
  Object.fromEntries(Object.entries(worker.env).flatMap(([name, binding]) => (binding.type === 'text' ? [[name, binding.value]] : [])))

const routes = (worker: Evaluated['worker']) => worker.triggers.filter(trigger => trigger.type === 'fetch')

/**
 * A route pattern's path against a request's path and query string, as Cloudflare matches it: the pattern sees the
 * whole URL, query included, a trailing `*` matches any rest, and otherwise the match is exact.
 */
const routeMatches = (pattern: string, pathAndQuery: string) => {
  const routePath = pattern.slice(pattern.indexOf('/'))
  return routePath.endsWith('*') ? pathAndQuery.startsWith(routePath.slice(0, -1)) : pathAndQuery === routePath
}

const atLeast = (version: string, floor: number[]) => {
  const parts = version.split('.').map(Number)
  const index = floor.findIndex((part, position) => parts[position] !== part)
  return index === -1 || (parts[index] ?? 0) > (floor[index] ?? 0)
}

describe('cloudflare.config.ts in production mode', () => {
  const values = text(production)

  it('binds two real, different Hyperdrive configurations', () => {
    const ids = [production.env.HYPERDRIVE_MAIN?.id, production.env.HYPERDRIVE_LOCKS?.id]
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{32}$/)
      expect(id).not.toMatch(/^0+$/)
    }
    expect(ids[0]).not.toBe(ids[1])
  })

  it('meets the compatibility date and the pg version Hyperdrive needs', () => {
    expect(production.compatibilityDate >= '2026-08-04').toBe(true)
    const pg = createRequire(import.meta.url)('pg/package.json') as { version: string }
    expect(atLeast(pg.version, [8, 16, 3]), pg.version).toBe(true)
  })

  it('serves the internal hostname as its domain and the public one through routes', () => {
    const { LIGRETTO_CORE_PUBLIC_HOST: publicHost, LIGRETTO_CORE_INTERNAL_HOST: internalHost } = values
    expect(publicHost).toBe('ligretto.app')
    expect(internalHost).toBe('core-internal.ligretto.app')
    // A Custom Domain binds a hostname to one Worker; ligretto.app is shared with the ligretto-frontend Worker.
    expect(production.domains).toEqual(['core-internal.ligretto.app'])
  })

  it('routes only the API, /health and /openapi.json of ligretto.app to this Worker', () => {
    expect(routes(production)).toEqual([
      { type: 'fetch', pattern: 'ligretto.app/api*', zone: 'ligretto.app' },
      { type: 'fetch', pattern: 'ligretto.app/health*', zone: 'ligretto.app' },
      { type: 'fetch', pattern: 'ligretto.app/openapi.json*', zone: 'ligretto.app' },
    ])
  })

  // A public route outside the patterns would reach the frontend Worker and answer the SPA. A pattern matches the query
  // string too, so each path is also checked with one: an exact pattern would hand `/health?probe=1` to the SPA.
  it('routes every path of the committed public document, with and without a query string', () => {
    const document = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8')) as { paths: Record<string, unknown> }
    const patterns = routes(production).map(route => route.pattern ?? '')
    for (const path of [...Object.keys(document.paths), '/openapi.json']) {
      for (const request of [path, `${path}?probe=1`]) {
        expect(
          patterns.some(pattern => routeMatches(pattern, request)),
          request,
        ).toBe(true)
      }
    }
  })

  it('points the auth flow at ligretto.app, the origin of the SPA and the API, with the cookie transport', () => {
    expect(values.LIGRETTO_CORE_AUTH_REDIRECT_URI).toBe('https://ligretto.app/api/auth/callback')
    expect(values.LIGRETTO_CORE_AUTH_APP_URL).toBe('https://ligretto.app/')
    expect(values.LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI).toBe('https://ligretto.app/')
    expect(values.LIGRETTO_CORE_AUTH_SESSION_TRANSPORT).toBe('cookie')
  })

  it('allows no CORS origin, because the routes put the SPA and the API on one origin', () => {
    expect(loadHttpConfig(values).corsOrigins).toEqual([])
  })

  it('carries no development value', () => {
    for (const [name, value] of Object.entries(values)) {
      expect(value, name).not.toContain('localhost')
    }
  })

  it('passes the configuration schemas', () => {
    expect(() => loadAuthConfig({ ...values, LIGRETTO_CAS_CLIENT_SECRET: 'placeholder' })).not.toThrow()
    expect(() => loadHttpConfig(values)).not.toThrow()
  })

  it('has a cron trigger and no workers.dev hostname', () => {
    expect(production.triggers.map(trigger => trigger.type)).toContain('scheduled')
    expect(production.workersDev).toBe(false)
  })
})

describe('cloudflare.config.ts in both modes', () => {
  // The SPA is the ligretto-frontend Worker, so no hostname of this one can serve it.
  it.each([
    ['production', production],
    ['development', development],
  ])('declares no assets in %s', (_mode, worker) => {
    expect(worker.assets).toBeUndefined()
    expect(Object.values(worker.env).map(binding => binding.type)).not.toContain('assets')
  })

  it.each(['DATABASE_URL', 'LIGRETTO_INTERNAL_API_TOKEN', 'LIGRETTO_CAS_CLIENT_SECRET'])('declares %s as a secret', name => {
    expect(production.env[name]?.type).toBe('secret')
    expect(development.env[name]?.type).toBe('secret')
  })
})

describe('cloudflare.config.ts outside production mode', () => {
  it('keeps the local hostnames and no domain or route, so `cf dev` still dispatches', () => {
    expect(development.domains).toEqual([])
    expect(routes(development)).toEqual([])
    expect(text(development).LIGRETTO_CORE_PUBLIC_HOST).toBe('localhost')
  })

  it('allows both dev server origins through CORS', () => {
    expect(loadHttpConfig(text(development)).corsOrigins).toEqual(['http://localhost:5173', 'http://localhost:5174'])
  })
})
