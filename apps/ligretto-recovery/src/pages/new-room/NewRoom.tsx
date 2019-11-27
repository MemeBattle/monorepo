import * as React from 'react'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { NewRoomContainer } from 'containers/new-room'

export const NewRoomPage = () => {
  return (
    <GameCoverScreen>
      <NewRoomContainer />
    </GameCoverScreen>
  )
}
