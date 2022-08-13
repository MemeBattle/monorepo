import { createSelector } from 'reselect'

import type { All } from 'types/store'
import { selectCurrentUserId } from 'ducks/auth'

import { selectUsersMap } from '../users'
import { mergePlayerAndUser } from './utils'

export const selectGame = (state: All) => state.game.game
export const selectGameId = (state: All) => selectGame(state).id
export const selectGameStatus = (state: All) => selectGame(state).status
export const selectPlayers = (state: All) => selectGame(state).players
export const selectSpectators = (state: All) => selectGame(state).spectators
export const selectIsGameLoaded = (state: All) => state.game.isGameLoaded
export const selectGameResults = (state: All) => state.game.results
export const selectPlaygroundDecks = (state: All) => selectGame(state).playground.decks

/** Game Config */
export const selectGameConfig = (state: All) => selectGame(state).config
export const selectIsDndEnabled = (state: All) => selectGameConfig(state).dndEnabled

/** Player State */
export const selectPlayer = (state: All) => selectPlayers(state)[selectCurrentUserId(state)]
export const selectPlayerCards = (state: All) => selectPlayer(state)?.cards
export const selectPlayerStackOpenDeckCards = (state: All) => selectPlayer(state)?.stackOpenDeck.cards
export const selectPlayerStackDeckCards = (state: All) => selectPlayer(state)?.stackDeck.cards
export const selectPlayerLigrettoDeckCards = (state: All) => selectPlayer(state)?.ligrettoDeck.cards
export const selectPlayerStatus = (state: All) => selectPlayer(state)?.status

/** Local Player State */
export const selectLocalPlayerState = (state: All) => state.game.localPlayerState
export const selectSelectedCardIndex = (state: All) => selectLocalPlayerState(state).selectedCardIndex

export const selectIsPlayerSpectator = (state: All) => {
  const currentPlayerId = selectCurrentUserId(state)
  return !!selectSpectators(state)[currentPlayerId]
}

export const selectOpponents = createSelector([selectPlayers, selectCurrentUserId, selectUsersMap], (players, playerId, users) =>
  Object.values(players).reduce((opponents: ReturnType<typeof mergePlayerAndUser>[], player) => {
    if (!player) {
      return opponents
    }
    const user = users[player.id]
    return [...opponents, ...(user && user.casId !== playerId ? [mergePlayerAndUser(player, user)] : [])]
  }, []),
)

export const selectActivePlayer = createSelector(selectPlayer, selectUsersMap, (currentPlayer, users) => {
  if (!currentPlayer) {
    return
  }
  const user = users[currentPlayer.id]
  if (user) {
    return mergePlayerAndUser(currentPlayer, user)
  }
})
