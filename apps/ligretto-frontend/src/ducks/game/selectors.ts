import { createSelector } from 'reselect'
import last from 'lodash/last'

import type { All } from 'types/store'
import { currentUserIdSelector } from 'ducks/auth'

import { usersMapSelector } from '../users'
import { mergePlayerAndUser, STACK_OPEN_DECK_INDEX } from './utils'
import type { SelectedCardIndex } from './slice'

export const gameSelector = (state: All) => state.game.game

export const gameIdSelector = (state: All) => gameSelector(state).id
export const gameStatusSelector = (state: All) => gameSelector(state).status
export const gameNameSelector = (state: All) => gameSelector(state).name

export const playersSelector = (state: All) => gameSelector(state).players
export const playersIdsSelector = createSelector(playersSelector, players => Object.keys(players))

export const spectatorsSelector = (state: All) => gameSelector(state).spectators

export const isGameLoadedSelector = (state: All) => state.game.isGameLoaded

export const gameResultsSelector = (state: All) => state.game.results

export const playgroundDecksSelector = (state: All) => gameSelector(state).playground.decks

/** Game Config */
export const gameConfigSelector = (state: All) => gameSelector(state).config
export const isDndEnabledSelector = (state: All) => gameConfigSelector(state).dndEnabled

/** Player State */
export const playerSelector = (state: All) => playersSelector(state)[currentUserIdSelector(state)]
export const playerCardsSelector = (state: All) => playerSelector(state)?.cards
export const playerStackOpenDeckCardsSelector = (state: All) => playerSelector(state)?.stackOpenDeck.cards
export const playerStackDeckCardsSelector = (state: All) => playerSelector(state)?.stackDeck.cards
export const playerLigrettoDeckCardsSelector = (state: All) => playerSelector(state)?.ligrettoDeck.cards
export const playerStatusSelector = (state: All) => playerSelector(state)?.status

/** Local Player State */
export const localPlayerStateSelector = (state: All) => state.game.localPlayerState
export const selectedCardIndexSelector = (state: All) => localPlayerStateSelector(state).selectedCardIndex
export const selectPlayerCardByIndex = (state: All, index: SelectedCardIndex | undefined) => {
  if (index === STACK_OPEN_DECK_INDEX) {
    return last(playerStackOpenDeckCardsSelector(state))
  } else if (typeof index === 'number') {
    return playerCardsSelector(state)?.[index]
  } else {
    return undefined
  }
}

export const isPlayerSpectatorSelector = (state: All) => {
  const currentPlayerId = currentUserIdSelector(state)
  return !!spectatorsSelector(state)[currentPlayerId]
}

export const opponentsSelector = createSelector([playersSelector, currentUserIdSelector, usersMapSelector], (players, playerId, users) =>
  Object.values(players).reduce((opponents: ReturnType<typeof mergePlayerAndUser>[], player) => {
    if (!player) {
      return opponents
    }
    const user = users[player.id]
    return [...opponents, ...(user && user.casId !== playerId ? [mergePlayerAndUser(player, user)] : [])]
  }, []),
)

export const activePlayerSelector = createSelector(playerSelector, usersMapSelector, (currentPlayer, users) => {
  if (!currentPlayer) {
    return
  }
  const user = users[currentPlayer.id]
  if (user) {
    return mergePlayerAndUser(currentPlayer, user)
  }
})
