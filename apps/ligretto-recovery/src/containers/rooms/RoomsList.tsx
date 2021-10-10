import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RoomsListProps } from '@memebattle/ligretto-ui'
import { RoomsList as RoomsListComponent } from '@memebattle/ligretto-ui'
import { selectRoomsList } from 'ducks/rooms'
import { useHistory, generatePath } from 'react-router'
import { routes } from 'utils/constants'

export const RoomsList = () => {
  const rooms = useSelector(selectRoomsList)
  const history = useHistory()

  const roomsProps = useMemo<RoomsListProps['rooms']>(
    () =>
      rooms.map(({ uuid, name, playersCount, playersMaxCount }) => ({
        id: uuid,
        name,
        playersCount,
        playersMaxCount,
        onClick: playersCount === playersMaxCount ? undefined : () => history.push(generatePath(routes.GAME, { roomUuid: uuid })),
        isDisabled: playersCount === playersMaxCount,
      })),
    [history, rooms],
  )

  return <RoomsListComponent rooms={roomsProps} />
}

RoomsList.displayName = 'RoomsList'
