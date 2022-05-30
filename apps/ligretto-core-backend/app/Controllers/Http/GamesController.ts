import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import GameModel from 'App/Models/Game'
import SaveRoundValidator from 'App/Validators/SaveRoundValidator'
import mergeWith from 'lodash/mergeWith'

import type { SaveRoundResponse } from '@memebattle/ligretto-shared'

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

    const roundScoresByUserId = roundResults.results.reduce((acc, result) => ({ ...acc, [result.playerId]: { score: result.score } }), {})

    await round.related('users').attach(roundScoresByUserId)

    await game.load(loader =>
      loader.preload('rounds', roundsQuery => {
        roundsQuery.preload('users')
      }),
    )

    console.log('Rounds', game.rounds)
    game.rounds.forEach(round => console.log(round))
    game.rounds[0].users.forEach(user => {
      console.log(user)
      console.log(user.$extras.pivot_score)
    })

    const gameScoresByUserId = game.rounds.reduce<Record<string, number>>((roundResults, round) => {
      round.users.forEach(user => {
        const userGameScores = roundResults[user.casId] || 0
        roundResults[user.casId] = userGameScores + user.$extras.pivot_score
      })
      return roundResults
    }, {})

    const gameResults: SaveRoundResponse = mergeWith(gameScoresByUserId, roundScoresByUserId, () => {

    })

    return { game, roundResults, round, gameResults }
  }
}
