import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { becomePlayerEmitAction } from '@memebattle/ligretto-shared'

import { gameIdSelector, isPlayerSpectatorSelector } from '#ducks/game'

import { PlayersScoresTable } from './PlayersScoresTable'
import { freeSeatsCountSelector, playersSelector } from './PlayersScoresTable.selectors'

export const PlayersScoresTableContainer = () => {
  const dispatch = useDispatch()
  const players = useSelector(playersSelector)
  const freeSeatsCount = useSelector(freeSeatsCountSelector)
  const gameId = useSelector(gameIdSelector)
  const isSpectator = useSelector(isPlayerSpectatorSelector)

  const handleTakeSeat = useCallback(() => {
    dispatch(becomePlayerEmitAction({ gameId }))
  }, [dispatch, gameId])

  return <PlayersScoresTable players={players} freeSeatsCount={freeSeatsCount} onTakeSeat={isSpectator ? handleTakeSeat : undefined} />
}
