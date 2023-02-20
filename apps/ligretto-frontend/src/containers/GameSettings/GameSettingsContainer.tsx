import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router'

import { routes } from 'utils/constants'
import { gameNameSelector, gameStatusSelector, playerSelector, startGameAction, togglePlayerStatusAction } from 'ducks/game'
import { GameSettings } from 'components/blocks/game/GameSettings'

export const GameSettingsContainer = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const gameName = useSelector(gameNameSelector)
  const gameStatus = useSelector(gameStatusSelector)
  const currentPlayer = useSelector(playerSelector)

  const handleReadyClick = useCallback(() => {
    dispatch(togglePlayerStatusAction())
  }, [dispatch])

  const handleStartClick = useCallback(() => {
    dispatch(startGameAction())
  }, [dispatch])

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
    />
  )
}
