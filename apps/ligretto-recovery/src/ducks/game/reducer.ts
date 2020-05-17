import { CardColors, Game, GameStatus } from '@memebattle/ligretto-shared'
import { GameTypes, GameAction } from './types'

export type GameState = {
  name: Game['name']
  id: Game['id']
  config: Game['config']
  status: Game['status']
  players: Game['players']
  playerColor: CardColors
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
}

export const gameReducer = (state: GameState = initialState, action: GameAction) => {
  switch (action.type) {
    case GameTypes.UPDATE_GAME:
      return { ...state, ...action.payload }
    case GameTypes.SET_PLAYER_COLOR:
      return { ...state, playerColor: action.payload }
    default:
      return state
  }
}
