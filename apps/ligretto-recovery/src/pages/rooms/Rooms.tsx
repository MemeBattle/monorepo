import * as React from 'react'
import { RoomsList } from 'containers/rooms'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import styles from './Rooms.module.scss'
import { PageHeader } from 'components/base/page-header'
import { SearchRooms } from 'containers/rooms/SearchRooms'

export const RoomsPage = () => (
  <GameCoverScreen>
    <div className={styles.roomsPage}>
      <PageHeader>Enter to room</PageHeader>
      <SearchRooms className={styles.search} />
      <RoomsList />
    </div>
  </GameCoverScreen>
)
