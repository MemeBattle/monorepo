import { createSelector } from '@reduxjs/toolkit'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import type { All } from '#types/store'
import { currentUserIdSelector } from '#ducks/auth'

import { usersMapSelector } from '../users'
import { mergePlayerAndUser } from './utils'

const gameSelector = (state: All) => state.game.game

export const gameIdSelector = (state: All) => gameSelector(state).id
export const gameStatusSelector = (state: All) => gameSelector(state).status
export const gameNameSelector = (state: All) => gameSelector(state).name

export const gamePlayersSelector = (state: All) => gameSelector(state).players

export const isGameReadyToStartSelector = createSelector(
  gamePlayersSelector,
  players => Object.values(players).filter(player => player?.status !== PlayerStatus.Disconnected).length > 1,
)

export const playersIdsSelector = createSelector(gamePlayersSelector, players => Object.keys(players))

export const spectatorsSelector = (state: All) => gameSelector(state).spectators

export const isGameLoadedSelector = (state: All) => state.game.isGameLoaded

export const gameResultsSelector = (state: All) => state.game.results

export const playgroundDecksSelector = (state: All) => gameSelector(state).playground.decks

/** Game Config */
const gameConfigSelector = (state: All) => gameSelector(state).config
export const startingDelayInSecSelector = (state: All) => gameConfigSelector(state).startingDelayInSec
export const playersMaxCountSelector = (state: All) => gameConfigSelector(state).playersMaxCount

/** Player State */
export const playerSelector = (state: All) => gamePlayersSelector(state)[currentUserIdSelector(state)]
export const playerCardsSelector = (state: All) => playerSelector(state)?.cards
export const playerStackOpenDeckCardsSelector = (state: All) => playerSelector(state)?.stackOpenDeck.cards
export const playerStackDeckCardsSelector = (state: All) => playerSelector(state)?.stackDeck.cards
export const playerLigrettoDeckCardsSelector = (state: All) => playerSelector(state)?.ligrettoDeck.cards
export const playerLigrettoDeckHiddenSelector = (state: All) => playerSelector(state)?.ligrettoDeck.isHidden
export const playerStatusSelector = (state: All) => playerSelector(state)?.status

/** The server decides, and refuses anything else: this only spares the user controls that would do nothing. */
export const canKickParticipantsSelector = createSelector(
  [playerSelector, gameStatusSelector],
  (player, status) =>
    !!player?.isHost && player.status !== PlayerStatus.Disconnected && (status === GameStatus.New || status === GameStatus.RoundFinished),
)

export const isPlayerSpectatorSelector = (state: All) => {
  const currentPlayerId = currentUserIdSelector(state)
  return !!spectatorsSelector(state)[currentPlayerId]
}

export const opponentsSelector = createSelector([gamePlayersSelector, currentUserIdSelector, usersMapSelector], (players, playerId, users) =>
  Object.values(players).reduce((opponents: ReturnType<typeof mergePlayerAndUser>[], player) => {
    if (!player) {
      return opponents
    }
    const user = users[player.id]
    return [...opponents, ...(user && user.sub !== playerId ? [mergePlayerAndUser(player, user)] : [])]
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
