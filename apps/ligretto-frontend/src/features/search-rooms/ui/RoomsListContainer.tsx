import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RoomsListProps } from './RoomsList'
import { RoomsList as RoomsListComponent } from './RoomsList'
import { useNavigate, generatePath } from 'react-router'

import { routes } from '#shared/constants'
import { foundRoomsSelector } from '#ducks/rooms'

export const RoomsListContainer = () => {
  const rooms = useSelector(foundRoomsSelector)
  const navigate = useNavigate()

  const roomsProps = useMemo<RoomsListProps['rooms']>(
    () =>
      rooms.map(({ uuid, name, playersCount, playersMaxCount }) => ({
        id: uuid,
        name,
        playersCount,
        playersMaxCount,
        onClick: () => navigate(generatePath(routes.GAME, { roomUuid: uuid })),
        isDisabled: playersCount === playersMaxCount,
      })),
    [navigate, rooms],
  )

  return <RoomsListComponent rooms={roomsProps} />
}
