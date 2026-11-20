import type { FC } from 'react'
import { useSelector } from 'react-redux'
import times from 'lodash/times'
import { Box } from '@memebattle/ui'

import { FreeSeat } from './FreeSeat/FreeSeat'
import { PlayerScoreRow } from './PlayerScoreRow/PlayerScoreRow'
import { freeSeatsCountSelector, rankedPlayerIdsSelector } from './PlayersScoresTable.selectors'
import { PlayersScoresTableHeader } from './PlayersScoresTableHeader'

export const PlayersScoresTable: FC = () => {
  const playerIds = useSelector(rankedPlayerIdsSelector)
  const freeSeatsCount = useSelector(freeSeatsCountSelector)

  return (
    <Box flex={1} flexDirection="column" overflow="auto" data-test-id="PlayersScoresTable">
      <PlayersScoresTableHeader hasStatuses />
      {playerIds.map(playerId => (
        <PlayerScoreRow key={playerId} playerId={playerId} />
      ))}
      {times(freeSeatsCount, index => (
        <FreeSeat key={`free-seat-${index}`} offersSeat={index === 0} />
      ))}
    </Box>
  )
}

PlayersScoresTable.displayName = 'PlayersScoresTable'
