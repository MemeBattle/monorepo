import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { GameStatus } from '@memebattle/ligretto-shared'
import { useParams } from 'react-router'

import { connectToRoomAction } from 'ducks/rooms'
import { selectGameStatus, selectIsGameLoaded, leaveGameAction, selectIsPlayerSpectator } from 'ducks/game'

import { GameContainer } from '../game'
import { GameLobbyContainer } from '../game-lobby'
import { GameSpectatorContainer } from '../game-spectator'

export const GamePageContainer = () => {
  const dispatch = useDispatch()
  const gameStatus = useSelector(selectGameStatus)
  const isGameLoaded = useSelector(selectIsGameLoaded)
  const isPlayerSpectator = useSelector(selectIsPlayerSpectator)
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

  if (gameStatus === GameStatus.InGame && isPlayerSpectator) {
    return <GameSpectatorContainer />
  }

  if (gameStatus === GameStatus.InGame) {
    return <GameContainer />
  }

  return <GameLobbyContainer />
}
