import { useCallback } from 'react'
import type { FC } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { kickFromRoomEmitAction } from '@memebattle/ligretto-shared'

import { gameIdSelector } from '#ducks/game'
import type { All } from '#types/store'

import { PlayerScoreRow } from '../PlayerScoreRow/PlayerScoreRow'
import { canKickPlayerSelector, playerRowSelector } from './PlayersTableItem.selectors'

interface PlayersTableItemProps {
  playerId: string
}

export const PlayersTableItem: FC<PlayersTableItemProps> = ({ playerId }) => {
  const dispatch = useDispatch()
  const gameId = useSelector(gameIdSelector)
  const player = useSelector((state: All) => playerRowSelector(state, playerId))
  const canKick = useSelector((state: All) => canKickPlayerSelector(state, playerId))

  const handleKickClick = useCallback(() => {
    dispatch(kickFromRoomEmitAction({ gameId, userId: playerId }))
  }, [dispatch, gameId, playerId])

  if (!player) {
    return null
  }

  return <PlayerScoreRow {...player} onKickClick={canKick ? handleKickClick : undefined} />
}

PlayersTableItem.displayName = 'PlayersTableItem'
