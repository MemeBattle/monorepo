import type { Game, GameResults, Player } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import type { Action, PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'
/*
export enum GameTypes {
  UPDATE_GAME = '@@game/UPDATE_GAME',
  TOGGLE_PLAYER_STATUS = '@@game/TOGGLE_PLAYER_STATUS',
  SET_PLAYER_ID = '@@game/SET_PLAYER_ID',
  START_GAME = '@@game/START_GAME',
  SET_GAME_LOADED = '@@game/SET_GAME_LOADED',
  SET_GAME_RESULT = '@@game/SET_GAME_RESULT',
}
Delete Enum
 */

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
export type StartGameAction = Action<'@@game/START_GAME'>
export type TogglePlayerStatusAction = Action<'@@game/TOGGLE_PLAYER_STATUS'>

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
export const togglePlayerStatusAction = createAction('@@game/TOGGLE_PLAYER_STATUS')
export const startGameAction = createAction('@@game/START_GAME')

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    setPlayerIdAction: (state, action: PayloadAction<string>) => {
      state.playerId = action.payload
    },
    updateGameAction: (
      state,
      action: PayloadAction<{
        name: Game['name']
        id: Game['id']
        status: Game['status']
        config: Game['config']
        players: Game['players']
      }>,
    ) => ({ ...state, ...action.payload }),
    setGameLoadedAction: (state, action: PayloadAction<boolean>) => {
      state.isGameLoaded = action.payload
    },
    setGameResultAction: (state, action: PayloadAction<GameResults>) => {
      state.results = action.payload
    },
  },
})

export const { setPlayerIdAction, updateGameAction, setGameLoadedAction, setGameResultAction } = gameSlice.actions
export const gameReducer = gameSlice.reducer
