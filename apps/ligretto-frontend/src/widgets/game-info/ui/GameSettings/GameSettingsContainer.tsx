import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router'

import { routes } from '#shared/constants'
import {
  gameNameSelector,
  gameStatusSelector,
  isGameReadyToStartSelector,
  playerSelector,
  resumeGameAction,
  startGameAction,
  togglePlayerStatusAction,
} from '#ducks/game'
import { GameSettings } from '#widgets/game-info'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

export const GameSettingsContainer = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const gameName = useSelector(gameNameSelector)
  const gameStatus = useSelector(gameStatusSelector)
  const currentPlayer = useSelector(playerSelector)
  const isGameReadyToStart = useSelector(isGameReadyToStartSelector)

  const handleReadyClick = useCallback(() => {
    dispatch(togglePlayerStatusAction())
  }, [dispatch])

  const handleStartClick = useCallback(() => {
    dispatch(gameStatus === GameStatus.Pause ? resumeGameAction() : startGameAction())
  }, [dispatch, gameStatus])

  const handleExitClick = useCallback(() => {
    navigate(routes.HOME)
  }, [navigate])

  return (
    <GameSettings
      gameStatus={gameStatus}
      gameName={gameName}
      canStartGame={currentPlayer?.isHost ?? false}
      onReadyClick={handleReadyClick}
      onStartClick={handleStartClick}
      onExitClick={handleExitClick}
      isButtonDisabled={!!currentPlayer?.isHost && !isGameReadyToStart}
      isPlayerReadyToPlay={currentPlayer?.status === PlayerStatus.ReadyToPlay}
    />
  )
}
