import React from 'react'
import { useSelector } from 'react-redux'

import { GameLobby } from 'components/blocks/game/GameLobby'

import { gameLobbyContainerSelector } from './GameLobbyContainer.selector'

export const GameLobbyContainer = () => {
  const { opponents, gameStatus, player } = useSelector(gameLobbyContainerSelector)

  return <GameLobby player={player} gameStatus={gameStatus} opponents={opponents} />
}
