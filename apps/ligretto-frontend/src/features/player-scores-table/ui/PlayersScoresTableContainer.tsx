import { useSelector } from 'react-redux'

import { PlayersScoresTable } from './PlayersScoresTable'
import { PlayersTableItem } from './PlayersTableItem/PlayersTableItem'
import { freeSeatsCountSelector, rankedPlayerIdsSelector } from './PlayersScoresTable.selectors'

export const PlayersScoresTableContainer = () => {
  const playerIds = useSelector(rankedPlayerIdsSelector)
  const freeSeatsCount = useSelector(freeSeatsCountSelector)

  return (
    <PlayersScoresTable hasStatuses freeSeatsCount={freeSeatsCount}>
      {playerIds.map(playerId => (
        <PlayersTableItem key={playerId} playerId={playerId} />
      ))}
    </PlayersScoresTable>
  )
}
