import * as React from 'react'

import { MainLayout } from 'components/layouts/main'
import { CreateRoomContainer } from 'containers/create-room'

import styles from './CreateRoom.module.scss'

export const CreateRoomPage = () => (
  <MainLayout>
    <div className={styles.root}>
      <CreateRoomContainer />
    </div>
  </MainLayout>
)
