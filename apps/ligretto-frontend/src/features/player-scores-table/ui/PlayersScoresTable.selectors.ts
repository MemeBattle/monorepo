import { createSelector } from '@reduxjs/toolkit'
import orderBy from 'lodash/orderBy'

import { gameResultsSelector, playersIdsSelector } from '#ducks/game'
import { userAvatarUrl, userLabel, usersMapSelector } from '#ducks/users'
import { currentUserIdSelector } from '#ducks/auth'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

export const playersSelector = createSelector(
  [playersIdsSelector, gameResultsSelector, usersMapSelector, currentUserIdSelector],
  (playersIds, gameResults, users, currentPlayerId) =>
    orderBy(
      playersIds.map(playerId => {
        const user = users[playerId]
        const playerResults = gameResults?.[playerId] || { roundScore: 0, gameScore: 0 }

        return {
          id: playerId,
          username: user ? userLabel(user) : '',
          avatar: user ? userAvatarUrl(user) : getRandomAvatar(playerId),
          roundPoints: [playerResults.roundScore],
          totalPoints: playerResults.gameScore,
          isPlayer: user?.sub === currentPlayerId,
        }
      }),
      'totalPoints',
      'desc',
    ),
)
