import type { UUID } from '@memebattle/ligretto-shared'
import GameModel from 'App/Models/Game'
import type { SaveRoundResponse } from '@memebattle/ligretto-shared'
import mergeWith from 'lodash/mergeWith'

type GameResults = Array<{ playerId: UUID; score: number }>

export default class GamesService {
  public async saveRound(gameId: UUID, roundResults: GameResults) {
    const game = await GameModel.find(gameId)
    if (!game) {
      throw new Error('Game not found')
    }

    const round = await game.related('rounds').create({})

    const roundScoresByUserId = roundResults.reduce<Record<UUID, { score: number }>>(
      (acc, result) => ({ ...acc, [result.playerId]: { score: result.score } }),
      {},
    )

    await round.related('users').attach(roundScoresByUserId)

    await game.load(loader =>
      loader.preload('rounds', roundsQuery => {
        roundsQuery.preload('users')
      }),
    )

    const gameScoresByUserId = game.rounds.reduce<Record<string, number>>((roundResults, round) => {
      round.users.forEach(user => {
        const userGameScores = roundResults[user.casId] || 0
        roundResults[user.casId] = userGameScores + user.$extras.pivot_score
      })
      return roundResults
    }, {})

    const gameResults: SaveRoundResponse['gameResults'] = mergeWith(gameScoresByUserId, roundScoresByUserId, (gameScore, { score: roundScore }) => ({
      gameScore,
      roundScore,
    }))

    return { game, roundResults, round, gameResults }
  }
}
