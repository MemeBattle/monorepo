import React from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { GameLobby as GameLobbyComponent } from 'components/blocks/game'
import { startGameAction, togglePlayerStatusAction } from 'ducks/game'

import { gameLobbyContainerSelector } from './GameLobbyContainer.selector'

export const GameLobbyContainer = () => {
  const dispatch = useDispatch()
  const { opponents, gameStatus, player } = useSelector(gameLobbyContainerSelector)

  const handleReadyToPlayButtonClick = React.useCallback(() => {
    dispatch(togglePlayerStatusAction())
  }, [dispatch])

  const handleStartGameClick = React.useCallback(() => {
    dispatch(startGameAction())
  }, [dispatch])

  return (
    <GameLobbyComponent
      player={player}
      gameStatus={gameStatus}
      opponents={opponents}
      handleReadyToPlayButtonClick={handleReadyToPlayButtonClick}
      handleStartGameClick={handleStartGameClick}
    />
  )
}
