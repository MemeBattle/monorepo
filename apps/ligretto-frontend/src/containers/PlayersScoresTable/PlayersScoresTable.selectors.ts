import { createSelector } from 'reselect'
import sortBy from 'lodash/sortBy'

import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import { gameResultsSelector, playersIdsSelector } from 'ducks/game'
import { usersMapSelector } from 'ducks/users'
import { currentUserIdSelector } from 'ducks/auth'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

export const playersSelector = createSelector(
  [playersIdsSelector, gameResultsSelector, usersMapSelector, currentUserIdSelector],
  (playersIds, gameResults, users, currentPlayerId) =>
    sortBy(
      playersIds.map(playerId => {
        const user = users[playerId]
        const playerResults = gameResults?.[playerId] || { roundScore: 0, gameScore: 0 }

        return {
          username: user?.isTemporary ? 'Guest' : user?.username || '',
          avatar: !user?.isTemporary && user?.avatar ? buildCasStaticUrl(user.avatar) : getRandomAvatar(user?.casId),
          roundPoints: [playerResults.roundScore],
          totalPoints: playerResults.gameScore,
          isPlayer: user?.casId === currentPlayerId,
        }
      }),
      'totalPoints',
    ),
)
