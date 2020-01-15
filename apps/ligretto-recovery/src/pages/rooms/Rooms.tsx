import * as React from 'react'
import { RoomsList } from 'containers/rooms'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import styles from './Rooms.module.scss'
import { PageHeader } from 'components/base/page-header'
import { SearchRooms } from 'containers/rooms/SearchRooms'
import { LinkBack } from 'components/base/link-back'
import { ButtonLink } from 'components/base/button-link'
import { routes } from 'utils/constants'

export const RoomsPage = () => (
  <GameCoverScreen>
    <div className={styles.roomsPage}>
      <PageHeader className={styles.header}>Enter to room</PageHeader>
      <SearchRooms className={styles.search} />
      <div className={styles.content}>
        <RoomsList />
        <div className={styles.bottomButtons}>
          <LinkBack />
          <ButtonLink to={routes.NEW_ROOM}>Create</ButtonLink>
        </div>
      </div>
    </div>
  </GameCoverScreen>
)
