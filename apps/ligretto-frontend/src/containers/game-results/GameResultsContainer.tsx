import React from 'react'
import { useSelector } from 'react-redux'
import { ResultsTable } from '@memebattle/ui'

import { gameResultsContainerSelector } from './GameResultsContainer.selector'

export const GameResultsContainer = () => {
  const results = useSelector(gameResultsContainerSelector)

  if (!results) {
    return null
  }

  return <ResultsTable players={results} />
}
