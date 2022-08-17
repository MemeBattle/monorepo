import React from 'react'
import { useSelector } from 'react-redux'
import { ResultsTable } from '@memebattle/ui'
import { createSelector } from 'reselect'
import sortBy from 'lodash/sortBy'

import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import { currentUserIdSelector } from 'ducks/auth'
import { usersMapSelector } from 'ducks/users'
import { gameResultsSelector } from 'ducks/game'

const selectGameResultsForTable = createSelector(
  gameResultsSelector,
  usersMapSelector,
  currentUserIdSelector,
  (gameResults, users, currentPlayerId) =>
    gameResults &&
    sortBy(Object.entries(gameResults), [([_, playerResults]) => -playerResults.gameScore]).map(([playerId, playerResults], index) => {
      const user = users[playerId]
      return {
        position: index + 1,
        username: user?.isTemporary ? 'Guest' : user?.username || '',
        avatar: !user?.isTemporary && user?.avatar ? buildCasStaticUrl(user.avatar) : undefined,
        roundPoints: playerResults.roundScore,
        totalPoints: playerResults.gameScore,
        isPlayer: user?.casId === currentPlayerId,
      }
    }),
)

export const GameResultsContainer = () => {
  const results = useSelector(selectGameResultsForTable)

  if (!results) {
    return null
  }

  return <ResultsTable players={results} />
}
