import type { HttpContext } from '@adonisjs/core/http'
import GameModel from '#models/Game'
import { saveRoundValidator } from '#validators/SaveRoundValidator'
import GamesService from '#services/GamesService'

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

  public async saveRound(ctx: HttpContext): Promise<SaveRoundResponse> {
    const gameId: UUID = ctx.params.id

    const { results } = await saveRoundValidator.validate(ctx.request.all())

    return await this.gamesService.saveRound(gameId, results)
  }
}
