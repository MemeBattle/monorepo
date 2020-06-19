import { Game, GameTypes } from '@memebattle/ligretto-shared'
import { AnyAction } from 'redux'

export type TechState = {
  game: Game | null
}

const initialState: TechState = {
  game: null,
}

export const techReducer = (state: TechState = initialState, action: AnyAction) => {
  switch (action.type) {
    case GameTypes.UPDATE_GAME:
      return { ...state, game: action.payload }
    default:
      return state
  }
}
