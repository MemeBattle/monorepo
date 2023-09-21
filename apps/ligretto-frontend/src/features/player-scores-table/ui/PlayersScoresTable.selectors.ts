import { createSelector } from '@reduxjs/toolkit'
import orderBy from 'lodash/orderBy'

import { buildCasStaticUrl } from 'shared/api/buildCasStaticUrl'
import { gameResultsSelector, playersIdsSelector } from 'ducks/game'
import { usersMapSelector } from 'ducks/users'
import { currentUserIdSelector } from 'ducks/auth'
import { getRandomAvatar } from 'shared/ui/Avatar/getRandomAvatar'

export const playersSelector = createSelector(
  [playersIdsSelector, gameResultsSelector, usersMapSelector, currentUserIdSelector],
  (playersIds, gameResults, users, currentPlayerId) =>
    orderBy(
      playersIds.map(playerId => {
        const user = users[playerId]
        const playerResults = gameResults?.[playerId] || { roundScore: 0, gameScore: 0 }

        return {
          id: playerId,
          username: user?.isTemporary ? 'Guest' : user?.username || '',
          avatar: !user?.isTemporary && user?.avatar ? buildCasStaticUrl(user.avatar) : getRandomAvatar(user?.casId),
          roundPoints: [playerResults.roundScore],
          totalPoints: playerResults.gameScore,
          isPlayer: user?.casId === currentPlayerId,
        }
      }),
      'totalPoints',
      'desc',
    ),
)
