import React from 'react'
import { useSelector } from 'react-redux'

import { PlayersScoresTable } from 'components/blocks/game/PlayersScoresTable'
import { playersSelector } from './PlayersScoresTable.selectors'

export const PlayersScoresTableContainer = () => {
  const players = useSelector(playersSelector)

  return <PlayersScoresTable players={players} />
}
