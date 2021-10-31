import type { Game, GameResults, Playground } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'

export type GameState = {
  name: Game['name']
  id: Game['id']
  config: Game['config']
  status: Game['status']
  players: Game['players']
  results?: GameResults
  isGameLoaded: boolean
  playground: Playground
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
  results: undefined,
  playground: {
    decks: [],
    droppedDecks: [],
  },
}

export const togglePlayerStatusAction = createAction('@@game/TOGGLE_PLAYER_STATUS')
export const startGameAction = createAction('@@game/START_GAME')
export const tapCardAction = createAction<{ cardIndex: number }>('@@game/TapCardAction')
export const tapStackOpenDeckCardAction = createAction('@@game/TapStackOpenDeckCardAction')
export const tapStackDeckCardAction = createAction('@@game/TapStackDeckCardAction')
export const tapLigrettoDeckCardAction = createAction('@@game/TapLigrettoDeckCardAction')
export const leaveGameAction = createAction('@@game/leaveGameAction')

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
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

export const { updateGameAction, setGameLoadedAction, setGameResultAction } = gameSlice.actions
export const gameReducer = gameSlice.reducer
