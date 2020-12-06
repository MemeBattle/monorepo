import * as React from 'react'
import { RoomsList } from 'containers/rooms'
import { CreateRoomContainer } from 'containers/create-room'
import { MainCoverScreen } from 'components/screens/main-cover-screen/MainCoverScreen'
import styles from './Rooms.module.scss'
import { PageHeader } from '@memebattle/ligretto-ui'
import { SearchRooms } from 'containers/rooms/SearchRooms'
import { LinkBack } from 'components/base/link-back'
import { ButtonLink } from 'components/base/button-link'
import { routes } from 'utils/constants'
import { selectIsRoomsListEmpty } from 'ducks/rooms'
import { useSelector } from 'react-redux'

export const RoomsPage = () => {

  const isRoomsListEmpty = useSelector(selectIsRoomsListEmpty)

  return (
    <MainCoverScreen>
      <div className={styles.roomsPage}>
        <div className={styles.top}>
          <PageHeader>Enter to room</PageHeader>
          <SearchRooms className={styles.search} />
        </div>
        <div className={styles.content}>
          {isRoomsListEmpty ? <CreateRoomContainer /> : <RoomsList /> }
          <div className={styles.bottomButtons}>
            <LinkBack />
          </div>
        </div>
      </div>
    </MainCoverScreen>
  )
}
