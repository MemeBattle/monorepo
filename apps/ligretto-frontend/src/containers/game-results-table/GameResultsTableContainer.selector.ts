import { createSelector } from 'reselect'
import sortBy from 'lodash/sortBy'

import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import { gameResultsSelector } from 'ducks/game'
import { usersMapSelector } from 'ducks/users'
import { currentUserIdSelector } from 'ducks/auth'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

export const gameResultsTableContainerSelector = createSelector(
  [gameResultsSelector, usersMapSelector, currentUserIdSelector],
  (gameResults, users, currentPlayerId) =>
    gameResults
      ? sortBy(Object.entries(gameResults), [([_, playerResults]) => -playerResults.gameScore]).map(([playerId, playerResults], index) => {
          const user = users[playerId]
          return {
            position: index + 1,
            username: user?.isTemporary ? 'Guest' : user?.username || '',
            avatar: !user?.isTemporary && user?.avatar ? buildCasStaticUrl(user.avatar) : getRandomAvatar(user?.casId),
            roundPoints: [playerResults.roundScore],
            totalPoints: playerResults.gameScore,
            isPlayer: user?.casId === currentPlayerId,
          }
        })
      : [],
)
