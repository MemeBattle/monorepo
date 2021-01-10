import React, { useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { RoomsListProps } from '@memebattle/ligretto-ui'
import { RoomsList as RoomsListComponent } from '@memebattle/ligretto-ui'
import { selectRoomsList, connectToRoomAction } from 'ducks/rooms'

export const RoomsList = () => {
  const dispatch = useDispatch()
  const rooms = useSelector(selectRoomsList)

  const roomsProps = useMemo<RoomsListProps['rooms']>(
    () =>
      rooms.map(({ uuid, name, playersCount, playersMaxCount }) => ({
        id: uuid,
        name,
        playersCount,
        playersMaxCount,
        onClick: playersCount === playersMaxCount ? undefined : () => dispatch(connectToRoomAction({ roomUuid: uuid })),
        isDisabled: playersCount === playersMaxCount,
      })),
    [rooms, dispatch],
  )

  return <RoomsListComponent rooms={roomsProps} />
}
