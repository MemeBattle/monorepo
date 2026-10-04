import type { Card, Game, GameResults, Playground } from '@memebattle/ligretto-shared'
import { canPlaceCardOnDeck, GameStatus } from '@memebattle/ligretto-shared'
import type { Draft, PayloadAction } from '@reduxjs/toolkit'
import { createAction, createSlice } from '@reduxjs/toolkit'
import last from 'lodash/last'

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
export const tapStackDeckCardAction = createAction('@@game/TapStackDeckCardAction')
export const tapLigrettoDeckCardAction = createAction('@@game/TapLigrettoDeckCardAction')

/**
 * Puts a card on a playground deck, reporting whether it went. Only the move itself is mirrored:
 * everything else a placement implies, such as sweeping a pile completed by a ten, stays
 * server-side and arrives with the authoritative state. Nothing here can go wrong for long — the
 * gameplay controller answers every placement with that state, accepted or not.
 */
const placeCardOnDeck = (playground: Draft<Playground>, card: Card | null | undefined, deckIndex: number) => {
  if (!card || !canPlaceCardOnDeck(card, playground.decks[deckIndex])) {
    return false
  }
  // A copy, so the card moving across the tree is never a draft detached from where it came from.
  const placed = { ...card }
  const deck = playground.decks[deckIndex]

  if (deck) {
    deck.cards.push(placed)
  } else {
    playground.decks[deckIndex] = { cards: [placed], isHidden: false }
  }
  return true
}

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

    /**
     * The two halves of a placement the player just made, mirrored ahead of the server echo so the
     * card leaves the hand on the same frame as the gesture. One action per socket command, the
     * same split as `putCardAction` / `putCardFromStackOpenDeck`.
     */
    putCardOptimisticallyAction: (state, action: PayloadAction<{ playerId: string; cardIndex: number; playgroundDeckIndex: number }>) => {
      const { playerId, cardIndex, playgroundDeckIndex } = action.payload
      const player = state.game.players[playerId]

      if (player && placeCardOnDeck(state.game.playground, player.cards[cardIndex], playgroundDeckIndex)) {
        player.cards[cardIndex] = null
      }
    },
    putCardFromStackOpenDeckOptimisticallyAction: (state, action: PayloadAction<{ playerId: string; playgroundDeckIndex: number }>) => {
      const { playerId, playgroundDeckIndex } = action.payload
      const player = state.game.players[playerId]

      if (player && placeCardOnDeck(state.game.playground, last(player.stackOpenDeck.cards), playgroundDeckIndex)) {
        player.stackOpenDeck.cards.pop()
      }
    },

    resetGameStateAction: () => initialState,
  },
})

export const {
  updateGameAction,
  setGameLoadedAction,
  setGameResultAction,
  putCardOptimisticallyAction,
  putCardFromStackOpenDeckOptimisticallyAction,
  resetGameStateAction,
} = gameSlice.actions
export const gameReducer = gameSlice.reducer
