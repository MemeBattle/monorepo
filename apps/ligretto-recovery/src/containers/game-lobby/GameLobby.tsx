import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { GameLobby as GameLobbyComponent } from 'components/blocks/game'
import { selectGameStatus, selectOpponents, selectPlayer, startGameAction, togglePlayerStatusAction } from 'ducks/game'

export const GameLobby = () => {
  const dispatch = useDispatch()
  const opponents = useSelector(selectOpponents)
  const player = useSelector(selectPlayer)
  const gameStatus = useSelector(selectGameStatus)

  const handleReadyToPlayButtonClick = React.useCallback(() => {
    dispatch(typeof togglePlayerStatusAction())
  }, [dispatch])

  const handleStartGameClick = React.useCallback(() => {
    dispatch(typeof startGameAction())
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
