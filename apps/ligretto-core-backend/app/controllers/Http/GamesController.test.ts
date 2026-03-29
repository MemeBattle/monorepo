import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import UserModel from '#models/User'

test.group('Games endpoints', group => {
  group.each.teardown(() => testUtils.db().truncate())
  test('POST /api/games — creates a game with UUID id', async ({ client, assert }) => {
    const response = await client.post('/api/games')
    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.id)
    assert.match(body.id, /^[0-9a-f-]{36}$/)
  })

  test('POST /api/games — repeated calls create different games', async ({ client, assert }) => {
    const res1 = await client.post('/api/games')
    const res2 = await client.post('/api/games')
    assert.notEqual(res1.body().id, res2.body().id)
  })

  test('GET /api/games — returns empty array when no games exist', async ({ client, assert }) => {
    const response = await client.get('/api/games')
    response.assertStatus(200)
    assert.isArray(response.body())
    assert.equal(response.body().length, 0)
  })

  test('GET /api/games — returns all created games', async ({ client, assert }) => {
    await client.post('/api/games')
    await client.post('/api/games')
    const response = await client.get('/api/games')
    response.assertStatus(200)
    assert.isArray(response.body())
    assert.isAtLeast(response.body().length, 2)
  })

  test('POST /api/games/:id/rounds — saves round and returns results', async ({ client, assert }) => {
    const user = await UserModel.firstOrCreate({ casId: 'player-1' }, { isTemporary: false })

    const gameRes = await client.post('/api/games')
    const gameId = gameRes.body().id

    const response = await client.post(`/api/games/${gameId}/rounds`).json({
      results: [{ playerId: user.casId, score: 10 }],
    })
    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.game)
    assert.exists(body.round)
    assert.exists(body.roundResults)
    assert.exists(body.gameResults)
    assert.equal(body.gameResults[user.casId].roundScore, 10)
    assert.equal(body.gameResults[user.casId].gameScore, 10)
  })

  test('POST /api/games/:id/rounds — accumulates scores across rounds', async ({ client, assert }) => {
    const user = await UserModel.firstOrCreate({ casId: 'player-2' }, { isTemporary: false })

    const gameRes = await client.post('/api/games')
    const gameId = gameRes.body().id

    await client.post(`/api/games/${gameId}/rounds`).json({
      results: [{ playerId: user.casId, score: 10 }],
    })

    const response = await client.post(`/api/games/${gameId}/rounds`).json({
      results: [{ playerId: user.casId, score: 5 }],
    })
    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.gameResults[user.casId].roundScore, 5)
    assert.equal(body.gameResults[user.casId].gameScore, 15)
  })

  test('POST /api/games/:id/rounds — non-existent gameId returns 500', async ({ client }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const response = await client.post(`/api/games/${fakeId}/rounds`).json({
      results: [{ playerId: 'player-1', score: 5 }],
    })
    response.assertStatus(500)
  })

  test('POST /api/games/:id/rounds — invalid UUID returns 404', async ({ client }) => {
    const response = await client.post('/api/games/not-a-uuid/rounds').json({
      results: [{ playerId: 'player-1', score: 5 }],
    })
    response.assertStatus(404)
  })

  test('POST /api/games/:id/rounds — invalid body returns 422', async ({ client }) => {
    const gameRes = await client.post('/api/games')
    const gameId = gameRes.body().id

    const response = await client.post(`/api/games/${gameId}/rounds`).json({
      results: [{ playerId: 'player-1' }],
    })
    response.assertStatus(422)
  })
})
