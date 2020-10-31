import * as React from 'react'
import { MainCoverScreen } from 'components/screens/main-cover-screen/MainCoverScreen'
import { CreateRoomContainer } from 'containers/create-room'

import styles from './CreateRoom.module.scss'

export const CreateRoomPage = () => (
  <MainCoverScreen>
    <div className={styles.root}>
      <CreateRoomContainer />
    </div>
  </MainCoverScreen>
)
