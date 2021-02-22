import type { Game, GameResults, Player } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import type { GameAction } from './types'
import { GameTypes } from './types'
import { createSlice } from '@reduxjs/toolkit'

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

const gameReducerSlice = createSlice({
  name: 'gameReducer',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(GameTypes.UPDATE_GAME, (state, action: GameAction) => {
      state.status = action.payload
    })
    builder.addCase(GameTypes.SET_PLAYER_ID, (state, action: GameAction) => {
      state.playerId = action.payload
    })
    builder.addCase(GameTypes.SET_GAME_LOADED, (state, action: GameAction) => {
      state.isGameLoaded = action.payload
    })
    builder.addCase(GameTypes.SET_GAME_RESULT, (state, action:GameAction) => {
      state.results = action.payload
    })
  },
})
