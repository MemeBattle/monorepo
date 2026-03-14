import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import GamesService from '#services/GamesService'
import GameModel from '#models/Game'
import UserModel from '#models/User'

test.group('GamesService.saveRound', group => {
  group.setup(() => testUtils.db().migrate())
  group.teardown(() => testUtils.db().truncate())
  group.each.teardown(() => testUtils.db().truncate())

  test('throws error when game is not found', async ({ assert }) => {
    const service = new GamesService()
    await assert.rejects(() => service.saveRound('00000000-0000-0000-0000-000000000000', []), 'Game not found')
  })

  test('correctly calculates gameScore across multiple rounds', async ({ assert }) => {
    const service = new GamesService()
    const game = await GameModel.create({})
    const user = await UserModel.firstOrCreate({ casId: 'unit-player-1' }, { isTemporary: false })

    await service.saveRound(game.id, [{ playerId: user.casId, score: 10 }])
    const result = await service.saveRound(game.id, [{ playerId: user.casId, score: 5 }])

    assert.equal(result.gameResults[user.casId].roundScore, 5)
    assert.equal(result.gameResults[user.casId].gameScore, 15)
  })

  test('correctly fills roundResults from pivot table', async ({ assert }) => {
    const service = new GamesService()
    const game = await GameModel.create({})
    const user1 = await UserModel.firstOrCreate({ casId: 'unit-player-a' }, { isTemporary: false })
    const user2 = await UserModel.firstOrCreate({ casId: 'unit-player-b' }, { isTemporary: false })

    const result = await service.saveRound(game.id, [
      { playerId: user1.casId, score: 7 },
      { playerId: user2.casId, score: 3 },
    ])

    assert.equal(result.gameResults[user1.casId].roundScore, 7)
    assert.equal(result.gameResults[user2.casId].roundScore, 3)
    assert.equal(result.gameResults[user1.casId].gameScore, 7)
    assert.equal(result.gameResults[user2.casId].gameScore, 3)
  })
})
