import React from 'react'
import { useSelector } from 'react-redux'
import { ResultsTable } from '@memebattle/ui'

import { gameResultsContainerSelector } from './GameResultsContainer.selector'

import { Avatar } from 'components/Avatar'

export const GameResultsContainer = () => {
  const results = useSelector(gameResultsContainerSelector)

  if (!results) {
    return null
  }

  return <ResultsTable AvatarComponent={Avatar} players={results} />
}
