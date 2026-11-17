import React from 'react'
import { useSelector } from 'react-redux'

import { PlayersScoresTable } from './PlayersScoresTable'
import { freeSeatsCountSelector, playersSelector } from './PlayersScoresTable.selectors'

export const PlayersScoresTableContainer = () => {
  const players = useSelector(playersSelector)
  const freeSeatsCount = useSelector(freeSeatsCountSelector)

  return <PlayersScoresTable players={players} freeSeatsCount={freeSeatsCount} />
}
