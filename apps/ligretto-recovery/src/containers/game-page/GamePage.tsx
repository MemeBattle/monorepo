import React from 'react'
import { useSelector } from 'react-redux'
import { selectGameStatus } from '../../ducks/game'
import { GameStatus } from '@memebattle/ligretto-shared'
import { Game } from '../game'
import { GameLobby } from '../game-lobby'

export const GamePage = () => {
  const gameStatus = useSelector(selectGameStatus)

  return gameStatus === GameStatus.InGame ? <Game /> : <GameLobby />
}
