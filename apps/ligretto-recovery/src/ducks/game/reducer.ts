import { Game, GameStatus } from '@memebattle/ligretto-shared'
import { UpdateGameAction, GameTypes } from './types'

export type GameState = {
  name: Game['name']
  id: Game['id']
  config: Game['config']
  status: Game['status']
}

const initialState: GameState = {
  status: GameStatus.New,
  id: '',
  name: '',
  config: {
    cardsCount: 0,
    playersMaxCount: 4,
  },
}

export const gameReducer = (state: GameState = initialState, action: UpdateGameAction) => {
  switch (action.type) {
    case GameTypes.UPDATE_GAME:
      return { ...state, ...action.payload }
    default:
      return state
  }
}
