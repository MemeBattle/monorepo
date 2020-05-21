import React from 'react'
import { useSelector } from 'react-redux'
import { selectGameStatus, selectIsGameLoaded } from 'ducks/game'
import { GameStatus } from '@memebattle/ligretto-shared'
import { Game } from '../game'
import { GameLobby } from '../game-lobby'

export const GamePage = () => {
  const gameStatus = useSelector(selectGameStatus)
  const isGameLoaded = useSelector(selectIsGameLoaded)

  if (!isGameLoaded) {
    return <>loading</>
  }

  return gameStatus === GameStatus.InGame ? <Game /> : <GameLobby />
}
