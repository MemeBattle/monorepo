import { describe, expect, it } from 'vitest'

import { createFixedClock } from '../core/ports/clock.fake'
import { okProbe } from '../core/ports/database-probe.fake'
import { createFakeGamesRepository } from '../core/ports/games-repository.fake'
import { createRecordingLogger } from '../core/ports/logger.fake'
import { createInternalApp } from './internal-app'
import { createPublicApp } from './public-app'
import type { InternalAppDeps } from './types'

const deps: InternalAppDeps = {
  logger: createRecordingLogger().logger,
  clock: createFixedClock(),
  database: okProbe(),
  corsOrigins: ['http://localhost:5173', 'http://localhost:5174'],
  games: createFakeGamesRepository(),
  internalTokens: ['test-token'],
}

describe('CORS on the public app', () => {
  const app = createPublicApp(deps)

  it('allows a configured origin with credentials', async () => {
    const res = await app.request('/health', { headers: { origin: 'http://localhost:5173' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it.each(['http://localhost.attacker.example', 'http://localhost:9999'])('does not allow %s', async origin => {
    const res = await app.request('/health', { headers: { origin } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers a preflight from a configured origin', async () => {
    const res = await app.request('/health', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5174', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5174')
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization')
  })

  it('allows nothing when no origin is configured', async () => {
    const res = await createPublicApp({ ...deps, corsOrigins: undefined }).request('/health', { headers: { origin: 'http://localhost:5173' } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('the internal app', () => {
  it('sends no CORS headers, whatever the origin', async () => {
    const app = createInternalApp(deps)
    for (const origin of ['http://localhost:5173', 'http://localhost.attacker.example']) {
      const res = await app.request('/health', { headers: { origin } })
      expect(res.status).toBe(200)
      expect([...res.headers.keys()].filter(key => key.startsWith('access-control-'))).toEqual([])
    }
  })
})
