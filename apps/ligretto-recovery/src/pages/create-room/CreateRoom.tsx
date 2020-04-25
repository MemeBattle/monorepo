import * as React from 'react'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { CreateRoomContainer } from 'containers/create-room'

export const CreateRoomPage = () => (
  <GameCoverScreen>
    <CreateRoomContainer />
  </GameCoverScreen>
)
