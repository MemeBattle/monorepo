import { GameStatus, type Game, type GameResults } from '@memebattle/ligretto-shared'
import { describe, expect, it } from 'vitest'

import { gameReducer, initialState, setGameResultAction, updateGameAction, type GameState } from './slice'

const withResults = (results?: GameResults): GameState => ({ ...initialState, results })

const update = (status: GameStatus): Game => ({ ...initialState.game, id: 'game', status })

describe('gameSlice results', () => {
  it('zeroes the round scores and keeps the totals when a round starts', () => {
    const state = gameReducer(withResults({ p1: { roundScore: 5, gameScore: 12 } }), updateGameAction(update(GameStatus.Starting)))

    expect(state.results).toEqual({ p1: { roundScore: 0, gameScore: 12 } })
  })

  it('leaves a room without results without results when a round starts', () => {
    expect(gameReducer(withResults(), updateGameAction(update(GameStatus.Starting))).results).toBeUndefined()
  })

  it.each([GameStatus.InGame, GameStatus.Pause, GameStatus.RoundFinished])('keeps the results on an update to %s', status => {
    const results = { p1: { roundScore: 5, gameScore: 12 } }

    expect(gameReducer(withResults(results), updateGameAction(update(status))).results).toEqual(results)
  })

  it('takes the results of the next recorded round after the reset', () => {
    const reset = gameReducer(withResults({ p1: { roundScore: 5, gameScore: 12 } }), updateGameAction(update(GameStatus.Starting)))
    const next = { p1: { roundScore: 3, gameScore: 15 } }

    expect(gameReducer(reset, setGameResultAction(next)).results).toEqual(next)
  })
})
