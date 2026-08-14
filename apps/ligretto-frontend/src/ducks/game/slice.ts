import type { Game, GameResults } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'

export type GameState = {
  game: Game
  results?: GameResults
  isGameLoaded: boolean
}

export const initialState: GameState = {
  game: {
    id: '',
    name: '',
    status: GameStatus.New,
    players: {},
    playground: {
      decks: [],
      droppedDecks: [],
    },
    config: {
      startingDelayInSec: 4,
      playersMaxCount: 4,
      maxCardsOnTable: 12,
    },
    spectators: {},
  },
  results: undefined,
  isGameLoaded: false,
}

export const togglePlayerStatusAction = createAction('@@game/TOGGLE_PLAYER_STATUS')
export const startGameAction = createAction('@@game/START_GAME')
export const resumeGameAction = createAction('@@game/RESUME_GAME')
export const tapCardAction = createAction<{ cardIndex: number }>('@@game/TapCardAction')
export const tapStackOpenDeckCardAction = createAction('@@game/TapStackOpenDeckCardAction')
export const tapStackDeckCardAction = createAction('@@game/TapStackDeckCardAction')
export const tapLigrettoDeckCardAction = createAction('@@game/TapLigrettoDeckCardAction')

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    updateGameAction: (state, action: PayloadAction<Game>) => {
      Object.assign(state.game, action.payload)
    },
    setGameLoadedAction: (state, action: PayloadAction<boolean>) => {
      state.isGameLoaded = action.payload
    },
    setGameResultAction: (state, action: PayloadAction<GameResults>) => {
      state.results = action.payload
    },

    resetGameStateAction: () => initialState,
  },
})

export const { updateGameAction, setGameLoadedAction, setGameResultAction, resetGameStateAction } = gameSlice.actions
export const gameReducer = gameSlice.reducer
