import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import GameModel from 'App/Models/Game'
import SaveRoundValidator from 'App/Validators/SaveRoundValidator'

export default class GamesController {
  public async index() {
    const games = await GameModel.all()
    return games
  }

  public async create() {
    const game = await GameModel.create({})

    return game
  }

  public async saveRound(ctx: HttpContextContract) {
    const gameId: number = ctx.params.id

    const game = await GameModel.find(gameId)

    if (!game) {
      return { error: 'Game not found' }
    }

    const roundResults = await ctx.request.validate(SaveRoundValidator)

    const round = await game.related('rounds').create({})
    await round.related('users').attach(roundResults.results.reduce((acc, result) => ({ ...acc, [result.playerId]: { score: result.score } }), {}))

    return { game, roundResults, round }
  }
}
