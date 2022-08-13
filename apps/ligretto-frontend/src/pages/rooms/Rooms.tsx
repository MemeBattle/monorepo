import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { PageHeader } from '@memebattle/ui'
import * as React from 'react'

import { RoomsListContainer } from 'containers/rooms'
import { CreateRoomContainer } from 'containers/create-room'
import { MainLayout } from 'components/layouts/main'
import { SearchRoomsContainer } from 'containers/rooms/SearchRooms'
import { LinkBack } from 'components/base/link-back'
import { selectIsRoomsListEmpty, searchRoomsAction } from 'ducks/rooms'

import styles from './Rooms.module.scss'

export const RoomsPage = () => {
  const dispatch = useDispatch()
  const isRoomsListEmpty = useSelector(selectIsRoomsListEmpty)

  useEffect(() => {
    dispatch(searchRoomsAction({ search: '' }))
  }, [dispatch])

  return (
    <MainLayout>
      <div className={styles.roomsPage}>
        <div className={styles.top}>
          <PageHeader>Enter to room</PageHeader>
          <SearchRoomsContainer className={styles.search} />
        </div>
        <div className={styles.content}>
          {isRoomsListEmpty ? <CreateRoomContainer /> : <RoomsListContainer />}
          <div className={styles.bottomButtons}>
            <LinkBack />
          </div>
        </div>
      </div>
    </MainLayout>
  )
}
