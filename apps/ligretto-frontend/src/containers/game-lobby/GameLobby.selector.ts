import { createSelector } from 'reselect'

import { currentUserIdSelector } from 'ducks/auth'
import { playersSelector, gameStatusSelector, opponentsSelector, mergePlayerAndUser } from 'ducks/game'
import { usersMapSelector } from 'ducks/users'

export const gameLobbySelector = createSelector(
  [playersSelector, currentUserIdSelector, gameStatusSelector, usersMapSelector, opponentsSelector],
  (players, playerId = '', gameStatus, users, opponents) => {
    const player = players[playerId]
    const user = users[playerId]

    return {
      opponents,
      gameStatus,
      player: player && user ? mergePlayerAndUser(player, user) : null,
    }
  },
)
