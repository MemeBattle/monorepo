import * as React from 'react'
import { RoomsList } from 'containers/rooms'
import { MainCoverScreen } from 'components/screens/main-cover-screen/MainCoverScreen'
import styles from './Rooms.module.scss'
import { PageHeader } from 'components/base/page-header'
import { SearchRooms } from 'containers/rooms/SearchRooms'
import { LinkBack } from 'components/base/link-back'
import { ButtonLink } from 'components/base/button-link'
import { routes } from 'utils/constants'

export const RoomsPage = () => (
  <MainCoverScreen>
    <div className={styles.roomsPage}>
      <div className={styles.top}>
        <PageHeader className={styles.header}>Enter to room</PageHeader>
        <SearchRooms className={styles.search} />
      </div>
      <div className={styles.content}>
        <RoomsList />
        <div className={styles.bottomButtons}>
          <LinkBack />
          <ButtonLink to={routes.CREATE_ROOM}>Create</ButtonLink>
        </div>
      </div>
    </div>
  </MainCoverScreen>
)
