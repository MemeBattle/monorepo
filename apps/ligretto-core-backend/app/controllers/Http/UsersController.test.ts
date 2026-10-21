/**
 * `GET /api/users` answers from the `users` snapshot alone. No CAS client is bound in this suite at all, which is
 * itself the proof: a route that still called CAS could not pass here.
 */

import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import UserModel from '#models/User'

const ACCOUNT = { casId: 'account-id', accountType: 'full', displayName: 'Some Name', avatarUrl: null } as const
const GUEST = { casId: 'guest-id', accountType: 'guest', displayName: null, avatarUrl: null } as const

test.group('GET /api/users', group => {
  group.each.setup(async () => {
    await UserModel.createMany([ACCOUNT, GUEST])
  })
  group.each.teardown(() => testUtils.db().truncate())

  test('with ids — the snapshot of each, and nothing else of the model', async ({ client, assert }) => {
    const response = await client.get('/api/users').qs({ ids: [ACCOUNT.casId, GUEST.casId] })

    response.assertStatus(200)
    // The ticket's shape exactly: no `isTemporary`, no timestamps. #816 is the consumer of this one. By membership,
    // because a lookup by a set of ids promises no order.
    assert.sameDeepMembers(response.body(), [ACCOUNT, GUEST])
  })

  test('with an id nothing is known about — absent from the answer', async ({ client, assert }) => {
    const response = await client.get('/api/users').qs({ ids: [ACCOUNT.casId, 'never-seen'] })

    response.assertStatus(200)
    assert.deepEqual(response.body(), [ACCOUNT])
  })

  test('with a single id — one repeated parameter and one bare one are the same query', async ({ client, assert }) => {
    const response = await client.get(`/api/users?ids=${GUEST.casId}`)

    response.assertStatus(200)
    assert.deepEqual(response.body(), [GUEST])
  })

  test('with an empty ids array — 422, as no ids over HTTP', async ({ client }) => {
    const response = await client.get('/api/users').qs({ ids: [] })
    response.assertStatus(422)
  })

  test('without ids — 422', async ({ client }) => {
    const response = await client.get('/api/users')
    response.assertStatus(422)
  })
})
