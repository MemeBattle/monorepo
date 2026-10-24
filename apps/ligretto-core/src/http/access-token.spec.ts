import { DiscoveryError, InvalidTokenError } from '@memebattle/ligretto-auth'
import { describe, expect, it } from 'vitest'

import { casUnavailableSchema, unauthorizedSchema } from '../contract/users'
import { createFakeUsersRepository } from '../core/ports/users-repository.fake'
import { claimsOf, createFakePublicDeps, VALID_ACCESS_TOKEN } from './deps.fake'
import { createPublicApp } from './public-app'
import type { PublicAppDeps } from './types'

const setup = (verifyAccessToken?: PublicAppDeps['verifyAccessToken']) => {
  const received: string[] = []
  const deps = createFakePublicDeps({
    users: createFakeUsersRepository([{ sub: 'alice', accountType: 'full', displayName: 'Alice', avatarUrl: null }]),
  })
  const verify = verifyAccessToken ?? deps.verifyAccessToken
  const app = createPublicApp({
    ...deps,
    verifyAccessToken: async token => {
      received.push(token)
      return await verify(token)
    },
  })
  const listUsers = (authorization?: string, query = '?ids=alice') =>
    app.request(`/api/users${query}`, { headers: authorization === undefined ? {} : { authorization } })
  return { listUsers, received, entries: deps.entries }
}

const expectUnauthorized = async (res: Response) => {
  expect(res.status).toBe(401)
  expect(res.headers.get('www-authenticate')).toBe('Bearer')
  expect(unauthorizedSchema.parse(await res.json()).error).toBe('unauthorized')
}

describe('the access token of GET /api/users', () => {
  it.each([
    ['no Authorization', undefined],
    ['the Basic scheme', `Basic ${VALID_ACCESS_TOKEN}`],
    ['no token', 'Bearer '],
    ['a token with trailing text', `Bearer ${VALID_ACCESS_TOKEN} extra`],
  ])('refuses %s as 401 unauthorized without calling the verifier', async (_name, authorization) => {
    const { listUsers, received } = setup()
    await expectUnauthorized(await listUsers(authorization))
    expect(received).toEqual([])
  })

  it.each([
    ['expired', new InvalidTokenError('expired', 'The token has expired.')],
    ['minted for another audience', new InvalidTokenError('wrong_audience', 'The token was minted for another audience.')],
  ])('refuses a token the verifier finds %s as 401 unauthorized', async (_name, failure) => {
    const { listUsers } = setup(async () => {
      throw failure
    })
    await expectUnauthorized(await listUsers('Bearer some-token'))
  })

  it("answers 503 cas_unavailable when CAS's metadata cannot be read", async () => {
    const { listUsers } = setup(async () => {
      throw new DiscoveryError('discovery_unavailable', 'CAS did not answer.')
    })
    const res = await listUsers('Bearer some-token')
    expect(res.status).toBe(503)
    expect(casUnavailableSchema.parse(await res.json()).error).toBe('cas_unavailable')
  })

  it('answers 500 internal_error for any other failure of the verifier', async () => {
    const { listUsers } = setup(async () => {
      throw new Error('a bug')
    })
    const res = await listUsers('Bearer some-token')
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'internal_error' })
  })

  it('lets an accepted token through, and hands the verifier exactly the token', async () => {
    const { listUsers, received } = setup()
    const res = await listUsers(`bearer   ${VALID_ACCESS_TOKEN}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ sub: 'alice', accountType: 'full', name: 'Alice', avatarUrl: null }])
    expect(received).toEqual([VALID_ACCESS_TOKEN])
  })

  it('refuses before the query is validated', async () => {
    const { listUsers } = setup()
    await expectUnauthorized(await listUsers('Bearer wrong-token', ''))
  })

  it('validates the query once the token is accepted', async () => {
    const { listUsers } = setup(async () => claimsOf('alice'))
    const res = await listUsers('Bearer any', '')
    expect(res.status).toBe(400)
  })

  it('never logs the presented token', async () => {
    const { listUsers, entries } = setup()
    await listUsers('Bearer secret-wrong-token')
    await listUsers(`Bearer ${VALID_ACCESS_TOKEN}`)
    expect(JSON.stringify(entries)).not.toMatch(/secret-wrong-token|valid-token/)
  })
})
