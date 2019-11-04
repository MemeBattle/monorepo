import * as React from 'react'
import { RoomsList } from 'containers/rooms'

import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'

export const RoomsPage = () => (
  <GameCoverScreen>
    <RoomsList />
  </GameCoverScreen>
)
