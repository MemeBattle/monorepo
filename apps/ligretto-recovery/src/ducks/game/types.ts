import { Action } from '@memebattle/redux-utils'
export enum GameTypes {
  UPDATE_GAME = '@@game/UPDATE_GAME',
}

export type UpdateGameAction = Action<GameTypes.UPDATE_GAME>

export type GameAction = UpdateGameAction
