import { createSelector } from 'reselect'
import { selectCurrentUserId } from 'ducks/auth'
import { selectPlayers, selectGameStatus, selectOpponents, mergePlayerAndUser } from 'ducks/game'
import { selectUsersMap } from 'ducks/users'

export const selector = createSelector(
  [selectPlayers, selectCurrentUserId, selectGameStatus, selectUsersMap, selectOpponents],
  (players, playerId = '', gameStatus, users, opponents) => ({
    opponents,
    gameStatus,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    player: mergePlayerAndUser(players[playerId], users[playerId]!),
  }),
)
