import type { UUID } from '@memebattle/ligretto-shared'
import GameModel from '#models/Game'
import type { SaveRoundResponse } from '@memebattle/ligretto-shared'

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

    await game.load(loader => loader.preload('rounds', roundsQuery => roundsQuery.preload('users')))

    const gameScoresByUserId = game.rounds.reduce<Record<string, number>>((roundResults, round) => {
      round.users.forEach(user => {
        const userGameScores = roundResults[user.casId] || 0
        roundResults[user.casId] = userGameScores + user.$extras.pivot_score
      })
      return roundResults
    }, {})

    const gameResults: SaveRoundResponse['gameResults'] = mergeGameResults(gameScoresByUserId, roundScoresByUserId)

    return { game, roundResults, round, gameResults }
  }
}

function mergeGameResults(
  gameScoresByUserId: Record<string, number>,
  roundScoresByUserId: Record<string, { score: number }>,
): Record<string, { roundScore: number; gameScore: number }> {
  const result: Record<string, { roundScore: number; gameScore: number }> = {}

  Object.entries(gameScoresByUserId).forEach(([userId, gameScore]) => {
    result[userId] = {
      roundScore: roundScoresByUserId[userId]?.score ?? 0,
      gameScore,
    }
  })

  return result
}
