import type { GamesRepository, RoundResult } from './ports/games-repository'

/**
 * Creating games and saving rounds for the gameplay backend (docs/DESIGN.md § Routes).
 *
 * Two invariants hold here. Ids are opaque strings compared for equality: their canonical form (a lowercase uuid) is
 * the contract's job at the HTTP boundary, so a caller that bypasses it must pass canonical ids or a repeat compares
 * unequal with what Postgres stored. And no write precedes a rejection: every refusal is decided before the round is
 * inserted, or, for a conflict, after an insert that wrote nothing, so the transaction commits nothing on a refusal.
 */

/** Per player: this round's score (`0` when they did not play it) and the sum of their scores in the game so far. */
export type GameResults = Record<string, { roundScore: number; gameScore: number }>

export type SaveRoundResult =
  | { ok: true; value: { gameResults: GameResults } }
  | { ok: false; error: 'game_not_found' }
  | { ok: false; error: 'unknown_players'; playerIds: string[] }
  | { ok: false; error: 'round_conflict' }

type GamesDeps = { games: GamesRepository }

export const createCreateGame =
  ({ games }: GamesDeps) =>
  (): Promise<{ id: string }> =>
    games.createGame()

const byPlayerId = (a: RoundResult, b: RoundResult) => (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)

/** The same set of `(playerId, score)` pairs, whatever the order. */
const sameResults = (a: readonly RoundResult[], b: readonly RoundResult[]) => {
  if (a.length !== b.length) {
    return false
  }
  const left = [...a].sort(byPlayerId)
  const right = [...b].sort(byPlayerId)
  return left.every((result, index) => result.playerId === right[index].playerId && result.score === right[index].score)
}

type RoundOutcome = Exclude<SaveRoundResult, { error: 'game_not_found' }>

/**
 * Saves a round, or recognises a repeat of one: the same `roundId` in the same game with identical results answers
 * the game's current totals, which may include rounds saved since; the same `roundId` with another game or other
 * results is `round_conflict`.
 */
export const createSaveRound =
  ({ games }: GamesDeps) =>
  async (gameId: string, roundId: string, results: readonly RoundResult[]): Promise<SaveRoundResult> => {
    const outcome = await games.withGame(gameId, async (game): Promise<RoundOutcome> => {
      const missing = await game.missingPlayers(results.map(result => result.playerId))
      if (missing.length > 0) {
        return { ok: false, error: 'unknown_players', playerIds: missing }
      }

      const { inserted } = await game.insertRound(roundId, results)
      if (!inserted) {
        const existing = await game.findRound(roundId)
        // `undefined` cannot follow a DO NOTHING on a committed row; it is a conflict rather than a throw all the same.
        if (existing === undefined || existing.gameId !== gameId || !sameResults(existing.results, results)) {
          return { ok: false, error: 'round_conflict' }
        }
      }

      const roundScores = new Map(results.map(result => [result.playerId, result.score]))
      const totals = await game.totals()
      const gameResults: GameResults = {}
      for (const { playerId, gameScore } of totals) {
        gameResults[playerId] = { roundScore: roundScores.get(playerId) ?? 0, gameScore }
      }
      return { ok: true, value: { gameResults } }
    })
    return outcome.status === 'game_not_found' ? { ok: false, error: 'game_not_found' } : outcome.value
  }
