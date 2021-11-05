import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import GameModel from 'App/Models/Game'

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

    return { game }
  }
}
