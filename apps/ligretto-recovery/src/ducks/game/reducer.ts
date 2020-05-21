import { CardColors, Game, GameStatus } from '@memebattle/ligretto-shared'
import { GameAction, GameTypes } from './types'

export type GameState = {
  name: Game['name']
  id: Game['id']
  config: Game['config']
  status: Game['status']
  players: Game['players']
  playerColor: CardColors
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
  playerColor: CardColors.empty,
  isGameLoaded: false,
}

export const gameReducer = (state: GameState = initialState, action: GameAction) => {
  switch (action.type) {
    case GameTypes.UPDATE_GAME:
      return { ...state, ...action.payload }
    case GameTypes.SET_PLAYER_COLOR:
      return { ...state, playerColor: action.payload }
    case GameTypes.SET_GAME_LOADED:
      return { ...state, isGameLoaded: action.payload }
    default:
      return state
  }
}
