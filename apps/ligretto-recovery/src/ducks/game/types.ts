import { Action } from '@memebattle/redux-utils'
import { Game, Player } from '@memebattle/ligretto-shared'
export enum GameTypes {
  UPDATE_GAME = '@@game/UPDATE_GAME',
  TOGGLE_PLAYER_STATUS = '@@game/TOGGLE_PLAYER_STATUS',
  SET_PLAYER_COLOR = '@@game/SET_PLAYER_COLOR',
}

export type UpdateGameAction = Action<
  GameTypes.UPDATE_GAME,
  {
    name: Game['name']
    id: Game['id']
    status: Game['status']
    config: Game['config']
    players: Game['players']
  }
>

export type SetPlayerColor = Action<GameTypes.SET_PLAYER_COLOR, Player['color']>

export type TogglePlayerStatusAction = Action<GameTypes.TOGGLE_PLAYER_STATUS>

export type GameAction = UpdateGameAction | TogglePlayerStatusAction | SetPlayerColor
