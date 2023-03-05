import React from 'react'
import { useSelector } from 'react-redux'
import { GameStatus } from '@memebattle/ligretto-shared'

import { ScreenCountdown } from 'components/blocks/game/ScreenCountdown'

import { GameContainer } from '../game'
import { GameLobbyContainer } from '../game-lobby'
import { GameSpectatorContainer } from '../game-spectator'
import { gamePageContainerSelector } from './GamePageContainer.selector'

export const GamePageContainer = () => {
  const { gameStatus, isGameLoaded, isPlayerSpectator, startingDelayInSec } = useSelector(gamePageContainerSelector)

  if (!isGameLoaded) {
    return <>loading</>
  }

  if (gameStatus === GameStatus.New || gameStatus === GameStatus.Pause || gameStatus === GameStatus.RoundFinished) {
    return <GameLobbyContainer />
  }

  return (
    <>
      {gameStatus === GameStatus.Starting && <ScreenCountdown timeToGo={startingDelayInSec} />}
      {isPlayerSpectator ? <GameSpectatorContainer /> : <GameContainer />}
    </>
  )
}
