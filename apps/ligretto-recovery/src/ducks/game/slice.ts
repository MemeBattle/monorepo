import type { Game, GameResults } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import type { PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'
import type { STACK_OPEN_DECK_INDEX } from './utils'

type SelectedCardIndex = number | typeof STACK_OPEN_DECK_INDEX

export type GameState = {
  game: Game
  results?: GameResults
  isGameLoaded: boolean
  localPlayerState: {
    selectedCardIndex?: SelectedCardIndex
  }
}

const initialState: GameState = {
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
      dndEnabled: false,
      cardsCount: 0,
      playersMaxCount: 4,
    },
  },
  results: undefined,
  isGameLoaded: false,
  localPlayerState: {},
}

export const togglePlayerStatusAction = createAction('@@game/TOGGLE_PLAYER_STATUS')
export const startGameAction = createAction('@@game/START_GAME')
export const tapCardAction = createAction<{ cardIndex: number; playgroundDeckIndex?: number }>('@@game/TapCardAction')
export const tapStackOpenDeckCardAction = createAction<{ playgroundDeckIndex: number } | undefined>('@@game/TapStackOpenDeckCardAction')
export const tapStackDeckCardAction = createAction('@@game/TapStackDeckCardAction')
export const tapLigrettoDeckCardAction = createAction('@@game/TapLigrettoDeckCardAction')
export const leaveGameAction = createAction('@@game/leaveGameAction')

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
    setSelectedCardIndexAction: (state, action: PayloadAction<SelectedCardIndex | undefined>) => {
      state.localPlayerState.selectedCardIndex = action.payload
    },
  },
})

export const { updateGameAction, setGameLoadedAction, setGameResultAction, setSelectedCardIndexAction } = gameSlice.actions
export const gameReducer = gameSlice.reducer
