import * as React from 'react'

import { MainLayout } from 'components/layouts/main'
import { ManageRoomsContainer } from 'containers/manage-rooms'

import styles from './ManageRooms.module.scss'

export const ManageRoomsPage = () => (
  <MainLayout>
    <div className={styles.root}>
      <ManageRoomsContainer />
    </div>
  </MainLayout>
)
