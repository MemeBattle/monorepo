import type { Game, GameResults, Player } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import type { GameAction } from './types'
import { GameTypes } from './types'

export type GameState = {
  name: Game['name']
  id: Game['id']
  config: Game['config']
  status: Game['status']
  players: Game['players']
  playerId: Player['id']
  results?: GameResults
  isGameLoaded: boolean
}

const initialState: GameState = {
  status: GameStatus.New,
  id: '',
  name: '',
  config: {
    cardsCount: 0,
    playersMaxCount: 4,
  },
  players: {},
  isGameLoaded: false,
  playerId: '',
  results: undefined,
}

export const gameReducer = (state: GameState = initialState, action: GameAction) => {
  switch (action.type) {
    case GameTypes.UPDATE_GAME:
      return { ...state, ...action.payload }
    case GameTypes.SET_PLAYER_ID:
      return { ...state, playerId: action.payload }
    case GameTypes.SET_GAME_LOADED:
      return { ...state, isGameLoaded: action.payload }
    case GameTypes.SET_GAME_RESULT:
      return { ...state, results: action.payload }
    default:
      return state
  }
}
