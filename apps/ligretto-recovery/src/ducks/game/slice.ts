import type { Game, GameResults, Player } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'

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

export const togglePlayerStatusAction = createAction('@@game/TOGGLE_PLAYER_STATUS')
export const startGameAction = createAction('@@game/START_GAME')
export const tapCardAction = createAction<{ cardIndex: number }>('@@game/TapCardAction')
export const tapStackOpenDeckCardAction = createAction('@@game/TapStackOpenDeckCardAction')
export const tapStackDeckCardAction = createAction('@@game/TapStackDeckCardAction')
export const tapLigrettoDeckCardAction = createAction('@@game/TapLigrettoDeckCardAction')

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
