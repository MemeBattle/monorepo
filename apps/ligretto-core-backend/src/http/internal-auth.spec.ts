import { describe, expect, it } from 'vitest'

import { invalidInternalTokenSchema } from '../contract/internal-auth.ts'
import { createFixedClock } from '../core/ports/clock.fake.ts'
import { okProbe } from '../core/ports/database-probe.fake.ts'
import { createFakeGamesRepository } from '../core/ports/games-repository.fake.ts'
import { createRecordingLogger } from '../core/ports/logger.fake.ts'
import { createInternalApp } from './internal-app.ts'

const setup = () => {
  const games = createFakeGamesRepository()
  const { logger, entries } = createRecordingLogger()
  const app = createInternalApp({ logger, clock: createFixedClock(), database: okProbe(), games, internalTokens: ['token-a', 'token-b'] })
  const createGame = (authorization?: string) =>
    app.request('/internal/games', { method: 'POST', headers: authorization === undefined ? {} : { authorization } })
  return { app, games, entries, createGame }
}

describe('the internal token', () => {
  it('refuses a request without Authorization as 401 invalid_internal_token, before the use case', async () => {
    const { games, createGame } = setup()
    const res = await createGame()
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Bearer')
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(invalidInternalTokenSchema.parse(await res.json()).error).toBe('invalid_internal_token')
    expect(games.games.size).toBe(0)
  })

  it.each([
    ['a wrong token', 'Bearer token-c'],
    ['a prefix of a configured token', 'Bearer token-'],
    ['the Basic scheme', 'Basic token-a'],
    ['no token', 'Bearer '],
    ['a token with trailing text', 'Bearer token-a extra'],
  ])('refuses %s', async (_name, authorization) => {
    const { games, createGame } = setup()
    const res = await createGame(authorization)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'invalid_internal_token' })
    expect(games.games.size).toBe(0)
  })

  it.each(['Bearer token-a', 'Bearer token-b', 'bearer token-a', 'Bearer   token-b'])('accepts %s', async authorization => {
    const { games, createGame } = setup()
    const res = await createGame(authorization)
    expect(res.status).toBe(201)
    expect(games.games.size).toBe(1)
  })

  it('guards the rounds route too, before the body is validated', async () => {
    const { app } = setup()
    const res = await app.request('/internal/games/not-a-uuid/rounds', { method: 'POST', body: '{' })
    expect(res.status).toBe(401)
  })

  it('leaves /health open', async () => {
    const { app } = setup()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
  })

  it('never logs the presented token', async () => {
    const { entries, createGame } = setup()
    await createGame('Bearer token-c')
    await createGame('Bearer token-a')
    expect(JSON.stringify(entries)).not.toMatch(/token-/)
  })
})
