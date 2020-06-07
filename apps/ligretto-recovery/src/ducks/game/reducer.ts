import { Game, GameStatus, Player } from '@memebattle/ligretto-shared'
import { GameAction, GameTypes } from './types'

export type GameState = {
  name: Game['name']
  id: Game['id']
  config: Game['config']
  status: Game['status']
  players: Game['players']
  playerId: Player['socketId']
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
}

export const gameReducer = (state: GameState = initialState, action: GameAction) => {
  switch (action.type) {
    case GameTypes.UPDATE_GAME:
      return { ...state, ...action.payload }
    case GameTypes.SET_PLAYER_ID:
      return { ...state, playerId: action.payload }
    case GameTypes.SET_GAME_LOADED:
      return { ...state, isGameLoaded: action.payload }
    default:
      return state
  }
}
