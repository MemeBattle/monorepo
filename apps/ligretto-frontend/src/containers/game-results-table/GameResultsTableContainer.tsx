import React from 'react'
import { useSelector } from 'react-redux'

import { GameResultsTable } from 'components/blocks/game/GameResultsTable'
import { gameResultsTableContainerSelector } from './GameResultsTableContainer.selector'

export const GameResultsTableContainer = () => {
  const players = useSelector(gameResultsTableContainerSelector)

  return <GameResultsTable players={players} />
}
