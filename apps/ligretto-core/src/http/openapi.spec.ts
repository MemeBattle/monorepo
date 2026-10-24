import { describe, expect, it } from 'vitest'

import { createFixedClock } from '../core/ports/clock.fake'
import { okProbe } from '../core/ports/database-probe.fake'
import { createFakeGamesRepository } from '../core/ports/games-repository.fake'
import { createRecordingLogger } from '../core/ports/logger.fake'
import { createInternalApp } from './internal-app'
import { internalApiDocument, publicApiDocument } from './openapi'
import { createPublicApp } from './public-app'

const deps = () => ({ logger: createRecordingLogger().logger, clock: createFixedClock(), database: okProbe() })

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
})

describe('the public document', () => {
  const document = publicApiDocument(createPublicApp(deps()))

  it('has /health only and no security scheme', () => {
    expect(Object.keys(document.paths ?? {})).toEqual(['/health'])
    expect(document.components?.securitySchemes).toBeUndefined()
  })
})
