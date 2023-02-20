import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { GameStatus } from '@memebattle/ligretto-shared'
import { useNavigate, useParams } from 'react-router'

import { connectToRoomAction } from 'ducks/rooms'
import { leaveGameAction } from 'ducks/game'

import { GameContainer } from '../game'
import { GameLobbyContainer } from '../game-lobby'
import { GameSpectatorContainer } from '../game-spectator'
import { gamePageContainerSelector } from './GamePageContainer.selector'
import { routes } from 'utils/constants'

export const GamePageContainer = () => {
  const dispatch = useDispatch()

  const navigate = useNavigate()

  const { gameStatus, isGameLoaded, isPlayerSpectator } = useSelector(gamePageContainerSelector)

  const { roomUuid } = useParams<{ roomUuid: string }>()

  useEffect(() => {
    if (!roomUuid) {
      navigate(routes.HOME)
      return
    }
    dispatch(connectToRoomAction({ roomUuid }))

    return function cleanUp() {
      dispatch(leaveGameAction())
    }
  }, [dispatch, navigate, roomUuid])

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
