import { createSelector } from 'reselect'

import { selectCurrentUserId } from 'ducks/auth'
import { selectPlayers, selectGameStatus, selectOpponents, mergePlayerAndUser } from 'ducks/game'
import { selectUsersMap } from 'ducks/users'

export const gameLobbySelector = createSelector(
  [selectPlayers, selectCurrentUserId, selectGameStatus, selectUsersMap, selectOpponents],
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
