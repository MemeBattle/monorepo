import { Action } from '@memebattle/redux-utils'
import { Game } from '@memebattle/ligretto-shared'
export enum GameTypes {
  UPDATE_GAME = '@@game/UPDATE_GAME',
}

export type UpdateGameAction = Action<
  GameTypes.UPDATE_GAME,
  {
    name: Game['name']
    id: Game['id']
    status: Game['status']
    config: Game['config']
  }
>

export type GameAction = UpdateGameAction
