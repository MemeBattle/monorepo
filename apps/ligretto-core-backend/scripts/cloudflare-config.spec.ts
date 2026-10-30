// The production values of cloudflare.config.ts, evaluated the way `cf build --mode production` does, and the
// development branch `cf dev` and the Worker suite rely on.
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { loadAuthConfig, loadHttpConfig } from '../src/core/config.ts'
import config from '../cloudflare.config.ts'

type Binding = { type: string; id?: string; value?: string }
type Evaluated = {
  worker: { compatibilityDate: string; domains: string[]; workersDev: boolean; triggers: { type: string }[]; env: Record<string, Binding> }
}

const evaluate = (mode: string | undefined) =>
  (config as unknown as (context: { mode: string | undefined; isPreview: boolean }) => Evaluated)({ mode, isPreview: false }).worker

const production = evaluate('production')
const development = evaluate(undefined)

const text = (worker: Evaluated['worker']) =>
  Object.fromEntries(Object.entries(worker.env).flatMap(([name, binding]) => (binding.type === 'text' ? [[name, binding.value]] : [])))

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

  it('serves two different hostnames, both as domains', () => {
    const { LIGRETTO_CORE_PUBLIC_HOST: publicHost, LIGRETTO_CORE_INTERNAL_HOST: internalHost } = values
    expect(publicHost).not.toBe(internalHost)
    expect(production.domains).toEqual(expect.arrayContaining([publicHost, internalHost]))
  })

  it('points the auth flow at the public hostname and the SPA', () => {
    const redirect = new URL(values.LIGRETTO_CORE_AUTH_REDIRECT_URI ?? '')
    expect(redirect.hostname).toBe(values.LIGRETTO_CORE_PUBLIC_HOST)
    expect(redirect.pathname).toBe('/api/auth/callback')
    expect(values.LIGRETTO_CORE_CORS_ORIGINS?.split(',')).toContain(new URL(values.LIGRETTO_CORE_AUTH_APP_URL ?? '').origin)
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
  it.each(['DATABASE_URL', 'LIGRETTO_INTERNAL_API_TOKEN', 'LIGRETTO_CAS_CLIENT_SECRET'])('declares %s as a secret', name => {
    expect(production.env[name]?.type).toBe('secret')
    expect(development.env[name]?.type).toBe('secret')
  })
})

describe('cloudflare.config.ts outside production mode', () => {
  it('keeps the local hostnames and no domain, so `cf dev` still dispatches', () => {
    expect(development.domains).toEqual([])
    expect(text(development).LIGRETTO_CORE_PUBLIC_HOST).toBe('localhost')
  })
})
