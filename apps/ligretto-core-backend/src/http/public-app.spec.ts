import { describe, expect, it } from 'vitest'

import { createFakeGamesRepository } from '../core/ports/games-repository.fake'
import { AUTH_HANDLER_HEADER, createFakePublicDeps } from './deps.fake'
import { createInternalApp } from './internal-app'
import { publicApiDocument } from './openapi'
import { createPublicApp } from './public-app'

const deps = createFakePublicDeps()

/** The CORS headers of a response. */
const corsHeaders = (res: Response) => [...res.headers.keys()].filter(key => key.startsWith('access-control-'))

describe('CORS on the public app', () => {
  const app = createPublicApp(deps)

  it('allows a configured origin with credentials', async () => {
    const res = await app.request('/health', { headers: { origin: 'http://localhost:5173' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it.each(['http://localhost.attacker.example', 'http://localhost:9999'])('sends %s no CORS header, credentials included', async origin => {
    const res = await app.request('/health', { headers: { origin } })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('access-control-allow-credentials')).toBeNull()
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

  it('answers a preflight from a refused origin with no CORS header', async () => {
    const res = await app.request('/api/users', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost.attacker.example', 'access-control-request-method': 'GET' },
    })
    expect(corsHeaders(res)).toEqual([])
  })

  it('allows nothing when no origin is configured', async () => {
    const res = await createPublicApp({ ...deps, corsOrigins: undefined }).request('/health', { headers: { origin: 'http://localhost:5173' } })
    expect(corsHeaders(res)).toEqual([])
  })

  it.each([
    ['an allowed origin', { origin: 'http://localhost:5173' }],
    ['a refused origin', { origin: 'http://localhost.attacker.example' }],
    ['no origin', {}],
  ])('says Vary: Origin to %s, so a cache never hands one answer to another origin', async (_name, headers) => {
    const res = await app.request('/openapi.json', { headers })
    expect(res.status).toBe(200)
    expect(res.headers.get('vary')?.split(/\s*,\s*/)).toContain('Origin')
  })

  it("keeps an auth handler's own headers beside the CORS ones", async () => {
    const res = await app.request('/api/auth/me', { headers: { origin: 'http://localhost:5173' } })
    expect(res.status).toBe(204)
    expect(res.headers.get(AUTH_HANDLER_HEADER)).toBe('me')
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })
})

describe('GET /openapi.json', () => {
  it('answers the generated public document', async () => {
    const app = createPublicApp(createFakePublicDeps())
    const res = await app.request('/openapi.json')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(publicApiDocument(createPublicApp(createFakePublicDeps())))
  })
})

describe('the internal app', () => {
  it('sends no CORS headers, whatever the origin', async () => {
    const app = createInternalApp({ ...deps, games: createFakeGamesRepository(), internalTokens: ['test-token'] })
    for (const origin of ['http://localhost:5173', 'http://localhost.attacker.example']) {
      const res = await app.request('/health', { headers: { origin } })
      expect(res.status).toBe(200)
      expect(corsHeaders(res)).toEqual([])
    }
  })
})
