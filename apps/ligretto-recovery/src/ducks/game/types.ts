import { Action } from '@memebattle/redux-utils'
import { Game, Player } from '@memebattle/ligretto-shared'

export enum GameTypes {
  UPDATE_GAME = '@@game/UPDATE_GAME',
  TOGGLE_PLAYER_STATUS = '@@game/TOGGLE_PLAYER_STATUS',
  SET_PLAYER_ID = '@@game/SET_PLAYER_ID',
  START_GAME = '@@game/START_GAME',
  SET_GAME_LOADED = '@@game/SET_GAME_LOADED',
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

export type SetPlayerColor = Action<GameTypes.SET_PLAYER_ID, Player['id']>

export type TogglePlayerStatusAction = Action<GameTypes.TOGGLE_PLAYER_STATUS>

export type StartGameAction = Action<GameTypes.START_GAME>

export type SetGameLoadedAction = Action<GameTypes.SET_GAME_LOADED, boolean>

export type GameAction = UpdateGameAction | TogglePlayerStatusAction | SetPlayerColor | StartGameAction | SetGameLoadedAction
