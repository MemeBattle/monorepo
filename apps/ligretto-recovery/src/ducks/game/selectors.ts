import type { Player } from '@memebattle/ligretto-shared'
import { createSelector } from 'reselect'

import type { All } from 'types/store'
import { selectCurrentUserId } from 'ducks/auth'

import { selectUsersMap } from '../users'
import { mergePlayerAndUser } from './utils'

export const selectGame = (state: All) => state.game.game
export const selectGameId = (state: All) => selectGame(state).id
export const selectGameStatus = (state: All) => selectGame(state).status
export const selectPlayers = (state: All) => selectGame(state).players
export const selectIsGameLoaded = (state: All) => state.game.isGameLoaded
export const selectGameResults = (state: All) => state.game.results
export const selectPlaygroundDecks = (state: All) => selectGame(state).playground.decks

/** Game Config */
export const selectGameConfig = (state: All) => selectGame(state).config
export const selectIsDndEnabled = (state: All) => selectGameConfig(state).dndEnabled

/** Player State */
export const selectPlayer = (state: All): Player => selectPlayers(state)[selectCurrentUserId(state)]
export const selectPlayerCards = (state: All) => selectPlayer(state).cards
export const selectPlayerStackOpenDeckCards = (state: All) => selectPlayer(state).stackOpenDeck.cards
export const selectPlayerStackDeckCards = (state: All) => selectPlayer(state).stackDeck.cards
export const selectPlayerLigrettoDeckCards = (state: All) => selectPlayer(state).ligrettoDeck.cards
export const selectPlayerStatus = (state: All) => selectPlayer(state).status
export const selectPlayerState = (state: All) => selectPlayer(state)

/** Local Player State */
export const selectLocalPlayerState = (state: All) => state.game.localPlayerState
export const selectSelectedCardIndex = (state: All) => selectLocalPlayerState(state).selectedCardIndex

export const selectOpponents = createSelector([selectPlayers, selectCurrentUserId, selectUsersMap], (players, playerId, users) =>
  Object.values(players).reduce((opponents: ReturnType<typeof mergePlayerAndUser>[], player) => {
    const user = users[player.id]
    return [...opponents, ...(user && user.casId !== playerId ? [mergePlayerAndUser(player, user)] : [])]
  }, []),
)
export const selectActivePlayer = createSelector([selectPlayers, selectCurrentUserId, selectUsersMap], (players, playerId, users) => {
  const resultUserArray = Object.values(players).reduce((opponents: ReturnType<typeof mergePlayerAndUser>[], player) => {
    const user = users[player.id]
    return [...opponents, ...(user && user.casId === playerId ? [mergePlayerAndUser(player, user)] : [])]
  }, [])
  return resultUserArray[0]
})
