import { createSelector } from 'reselect'
import omit from 'lodash/omit'
import type { Player } from '@memebattle/ligretto-shared'
import type { All } from '../../types/store'

export const selectPlayerId = (state: All) => state.game.playerId
export const selectGameId = (state: All) => state.game.id
export const selectGameStatus = (state: All) => state.game.status
export const selectPlayers = (state: All) => state.game.players
export const selectIsGameLoaded = (state: All) => state.game.isGameLoaded
export const selectGameResults = (state: All) => state.game.results
export const selectPlaygroundDecks = (state: All) => state.game.playground.decks
export const selectPlayer = (state: All): Player | undefined => selectPlayers(state)[selectPlayerId(state)]
export const selectPlayerCards = (state: All) => selectPlayers(state)[selectPlayerId(state)].cards
export const selectPlayerStackOpenDeckCards = (state: All) => selectPlayers(state)[selectPlayerId(state)].stackOpenDeck.cards
export const selectPlayerStackDeckCards = (state: All) => selectPlayers(state)[selectPlayerId(state)].stackDeck.cards
export const selectPlayerLigrettoDeckCards = (state: All) => selectPlayers(state)[selectPlayerId(state)].ligrettoDeck.cards

export const selectPlayerStatus = (state: All) => selectPlayer(state)?.status
export const selectOpponents = createSelector([selectPlayers, selectPlayerId], (players, playerId) => Object.values(omit(players, playerId)))
