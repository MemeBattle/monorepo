import { describe, expect, it } from 'vitest'

import { createFixedClock } from '../core/ports/clock.fake.ts'
import { okProbe } from '../core/ports/database-probe.fake.ts'
import { createFakeGamesRepository } from '../core/ports/games-repository.fake.ts'
import { createRecordingLogger } from '../core/ports/logger.fake.ts'
import { createFakePublicDeps } from './deps.fake.ts'
import { createInternalApp } from './internal-app.ts'
import { internalApiDocument, publicApiDocument } from './openapi.ts'
import { createPublicApp } from './public-app.ts'

const deps = () => ({ logger: createRecordingLogger().logger, clock: createFixedClock(), database: okProbe() })

/** Every operation of a document by its `<METHOD> <path>`, with its `operationId`. */
const operationIds = (document: { paths?: object }) =>
  Object.entries(document.paths ?? {}).flatMap(([path, item]: [string, object]) =>
    Object.entries(item).map(([method, operation]: [string, { operationId?: string }]) => [`${method.toUpperCase()} ${path}`, operation.operationId]),
  )

describe('the internal document', () => {
  const document = internalApiDocument(createInternalApp({ ...deps(), games: createFakeGamesRepository(), internalTokens: ['t'] }))
  const createGame = document.paths?.['/internal/games']?.post
  const saveRound = document.paths?.['/internal/games/{id}/rounds']?.post

  it('lists exactly the routes of the internal app', () => {
    expect(Object.keys(document.paths ?? {}).sort()).toEqual(['/health', '/internal/games', '/internal/games/{id}/rounds'])
  })

  it('declares every status of the two routes, the 401 of the middleware included', () => {
    expect(Object.keys(createGame?.responses ?? {})).toEqual(['201', '401'])
    expect(Object.keys(saveRound?.responses ?? {})).toEqual(['200', '400', '401', '404', '409', '422'])
  })

  it('puts every /internal route under the bearer scheme', () => {
    expect(createGame?.security).toEqual([{ internalToken: [] }])
    expect(saveRound?.security).toEqual([{ internalToken: [] }])
    expect(document.components?.securitySchemes?.internalToken).toMatchObject({ type: 'http', scheme: 'bearer' })
    expect(document.paths?.['/health']?.get?.security).toBeUndefined()
  })

  it('requires the request body and renders the score and id formats', () => {
    expect(saveRound?.requestBody).toMatchObject({ required: true })
    const request = document.components?.schemas?.SaveRoundRequest as {
      properties: { roundId: object; results: { items: { properties: { score: object } } } }
    }
    expect(request.properties.results.items.properties.score).toMatchObject({ type: 'integer', minimum: -2147483648, maximum: 2147483647 })
    expect(request.properties.roundId).toMatchObject({ type: 'string', format: 'uuid' })
    expect(saveRound?.parameters).toEqual([
      expect.objectContaining({ name: 'id', in: 'path', required: true, schema: expect.objectContaining({ format: 'uuid' }) }),
    ])
  })

  it('names every operation, which is the generated client function name', () => {
    const ids = operationIds(document)
    expect(Object.fromEntries(ids)).toEqual({
      'GET /health': 'getHealth',
      'POST /internal/games': 'createGame',
      'POST /internal/games/{id}/rounds': 'saveRound',
    })
    expect(new Set(ids.map(([, id]) => id)).size).toBe(ids.length)
  })
})

describe('the public document', () => {
  const document = publicApiDocument(createPublicApp(createFakePublicDeps()))
  const get = (path: string) => document.paths?.[path]?.get
  const AUTH_ROUTES = ['/api/auth/me', '/api/auth/sign-in', '/api/auth/callback', '/api/auth/logout']

  it('lists exactly the public routes, and not /openapi.json itself', () => {
    expect(Object.keys(document.paths ?? {}).sort()).toEqual(
      ['/health', '/api/auth/me', '/api/auth/sign-in', '/api/auth/callback', '/api/auth/logout', '/api/users'].sort(),
    )
  })

  it.each([
    ['/api/auth/me', ['200', '429', '503']],
    ['/api/auth/sign-in', ['200', '302', '429', '503']],
    ['/api/auth/callback', ['302', '400', '429', '503']],
    ['/api/auth/logout', ['200', '302', '503']],
    ['/api/users', ['200', '400', '401', '503']],
  ])('declares the statuses of %s for both session transports', (path, statuses) => {
    expect(Object.keys(get(path)?.responses ?? {}).sort()).toEqual(statuses)
  })

  it.each(AUTH_ROUTES)('admits session_busy beside the package codes in the 503 of %s', path => {
    const schema = (get(path)?.responses?.['503'] as { content: { 'application/json': { schema: { anyOf: object[] } } } }).content['application/json']
      .schema
    expect(schema.anyOf).toContainEqual({ $ref: '#/components/schemas/SessionBusy' })
    expect(schema.anyOf).toContainEqual(
      expect.objectContaining({
        properties: expect.objectContaining({ error: expect.objectContaining({ enum: expect.arrayContaining(['cas_unavailable']) }) }),
      }),
    )
  })

  it.each(AUTH_ROUTES)('tags %s auth', path => {
    expect(get(path)?.tags).toEqual(['auth'])
  })

  it('requires the state of the callback', () => {
    expect(get('/api/auth/callback')?.parameters).toContainEqual(expect.objectContaining({ name: 'state', in: 'query', required: true }))
  })

  it('describes ids as a repeated query parameter of 1 to 100 strings', () => {
    expect(get('/api/users')?.parameters).toEqual([
      expect.objectContaining({
        name: 'ids',
        in: 'query',
        required: true,
        style: 'form',
        explode: true,
        schema: expect.objectContaining({ type: 'array', items: expect.objectContaining({ type: 'string' }), minItems: 1, maxItems: 100 }),
      }),
    ])
  })

  it('puts /api/users alone under the access-token scheme', () => {
    expect(get('/api/users')?.security).toEqual([{ accessToken: [] }])
    expect(document.components?.securitySchemes?.accessToken).toMatchObject({ type: 'http', scheme: 'bearer' })
    for (const path of ['/health', ...AUTH_ROUTES]) {
      expect(get(path)?.security).toBeUndefined()
    }
  })

  it('names every operation, which is the generated client function name', () => {
    const ids = operationIds(document)
    expect(Object.fromEntries(ids)).toEqual({
      'GET /health': 'getHealth',
      'GET /api/auth/me': 'getMe',
      'GET /api/auth/sign-in': 'signIn',
      'GET /api/auth/callback': 'authCallback',
      'GET /api/auth/logout': 'logout',
      'GET /api/users': 'listUsers',
    })
    expect(new Set(ids.map(([, id]) => id)).size).toBe(ids.length)
  })

  it('names the AuthUser component', () => {
    expect(document.components?.schemas?.AuthUser).toMatchObject({ type: 'object', required: ['sub', 'accountType', 'name', 'avatarUrl'] })
  })
})
