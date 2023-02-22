import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { GameStatus } from '@memebattle/ligretto-shared'
import { useNavigate, useParams } from 'react-router'

import { connectToRoomAction } from 'ducks/rooms'
import { leaveGameAction } from 'ducks/game'

import { routes } from 'utils/constants'
import { ScreenCountdown } from 'components/blocks/game/ScreenCountdown'

import { GameContainer } from '../game'
import { GameLobbyContainer } from '../game-lobby'
import { GameSpectatorContainer } from '../game-spectator'
import { gamePageContainerSelector } from './GamePageContainer.selector'

export const GamePageContainer = () => {
  const dispatch = useDispatch()

  const navigate = useNavigate()

  const { gameStatus, isGameLoaded, isPlayerSpectator, startingDelayInSec } = useSelector(gamePageContainerSelector)

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
