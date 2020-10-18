import React from 'react'
import { useSelector } from 'react-redux'
import { selectGameResults } from 'ducks/game'
import { ResultsTable } from '@memebattle/ligretto-ui'
import { createSelector } from 'reselect'
import sortBy from 'lodash/sortBy'

const selectGameResultsForTable = createSelector(
  selectGameResults,
  gameResults =>
    gameResults &&
    sortBy(Object.entries(gameResults), [([_, playerResults]) => playerResults.gameScore]).map(([playerId, playerResults], index) => ({
      position: index + 1,
      username: playerId,
      roundPoints: playerResults.roundScore,
      totalPoints: playerResults.gameScore,
    })),
)

export const GameResults = () => {
  const results = useSelector(selectGameResultsForTable)

  if (!results) {
    return null
  }

  return <ResultsTable players={results} />
}
