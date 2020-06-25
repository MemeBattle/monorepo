import * as React from 'react'
import { MainCoverScreen } from 'components/screens/main-cover-screen/MainCoverScreen'
import { CreateRoomContainer } from 'containers/create-room'

export const CreateRoomPage = () => (
  <MainCoverScreen>
    <CreateRoomContainer />
  </MainCoverScreen>
)
