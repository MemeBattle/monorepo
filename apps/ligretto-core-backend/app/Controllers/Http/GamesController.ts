import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import GameModel from 'App/Models/Game'
import SaveRoundValidator from 'App/Validators/SaveRoundValidator'
import GamesService from 'App/Services/GamesService'

import type { UUID } from '@memebattle/ligretto-shared'
import type { SaveRoundResponse } from '@memebattle/ligretto-shared'

export default class GamesController {
  gamesService = new GamesService()

  public async index() {
    const games = await GameModel.all()
    return games
  }

  public async create() {
    const game = await GameModel.create({})

    return game
  }

  public async saveRound(ctx: HttpContextContract): Promise<SaveRoundResponse> {
    const gameId: UUID = ctx.params.id

    const { results } = await ctx.request.validate(SaveRoundValidator)

    return await this.gamesService.saveRound(gameId, results)
  }
}
