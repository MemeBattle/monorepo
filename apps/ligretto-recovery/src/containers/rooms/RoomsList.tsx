import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Room } from '@memebattle/ligretto-shared'
import { RoomsList as RoomsListComponent } from 'components/blocks/enter-game/rooms-list'
import { selectRoomsList, connectToRoomAction } from 'ducks/rooms'

export const RoomsList = () => {
  const dispatch = useDispatch()
  const rooms = useSelector(selectRoomsList)

  const handleRoomClick = React.useCallback((roomUuid: Room['uuid']) => () => dispatch(connectToRoomAction({ roomUuid })), [dispatch])

  return <RoomsListComponent rooms={rooms} onRoomClick={handleRoomClick} />
}
