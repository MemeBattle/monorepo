import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { selectGameStatus, selectIsGameLoaded, leaveGameAction } from 'ducks/game'
import { GameStatus } from '@memebattle/ligretto-shared'
import { Game } from '../game'
import { GameLobby } from '../game-lobby'
import { connectToRoomAction } from '../../ducks/rooms'
import { useParams } from 'react-router'

export const GamePage = () => {
  const dispatch = useDispatch()
  const gameStatus = useSelector(selectGameStatus)
  const isGameLoaded = useSelector(selectIsGameLoaded)
  const { roomUuid } = useParams<{ roomUuid: string }>()

  useEffect(() => {
    dispatch(connectToRoomAction({ roomUuid }))

    return function cleanUp() {
      dispatch(leaveGameAction())
    }
  }, [dispatch, roomUuid])

  if (!isGameLoaded) {
    return <>loading</>
  }

  return gameStatus === GameStatus.InGame ? <Game /> : <GameLobby />
}
