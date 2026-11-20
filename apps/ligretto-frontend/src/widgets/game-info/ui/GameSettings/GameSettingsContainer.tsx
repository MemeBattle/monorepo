import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router'

import { routes } from '#shared/constants'
import {
  gameNameSelector,
  gameStatusSelector,
  isGameReadyToStartSelector,
  playerSelector,
  playersIdsSelector,
  playersMaxCountSelector,
  resumeGameAction,
  startGameAction,
  togglePlayerStatusAction,
} from '#ducks/game'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { GameSettings } from './GameSettings'

const isBetweenRounds = (gameStatus: GameStatus) => gameStatus === GameStatus.New || gameStatus === GameStatus.RoundFinished

export const GameSettingsContainer = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const gameName = useSelector(gameNameSelector)
  const gameStatus = useSelector(gameStatusSelector)
  const currentPlayer = useSelector(playerSelector)
  const isGameReadyToStart = useSelector(isGameReadyToStartSelector)
  const playersCount = useSelector(playersIdsSelector).length
  const playersMaxCount = useSelector(playersMaxCountSelector)

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
      playersCount={playersCount}
      playersMaxCount={playersMaxCount}
      canStartGame={currentPlayer?.isHost ?? false}
      isSpectatorBetweenRounds={!currentPlayer && isBetweenRounds(gameStatus)}
      canToggleReady={!!currentPlayer && currentPlayer.status !== PlayerStatus.Disconnected && isBetweenRounds(gameStatus)}
      onReadyClick={handleReadyClick}
      onStartClick={handleStartClick}
      onExitClick={handleExitClick}
      isStartDisabled={!isGameReadyToStart}
      isPlayerReadyToPlay={currentPlayer?.status === PlayerStatus.ReadyToPlay}
    />
  )
}
