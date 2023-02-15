import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RoomsListProps } from 'components/blocks/home/RoomsList'
import { RoomsList as RoomsListComponent } from 'components/blocks/home/RoomsList'
import { useHistory, generatePath } from 'react-router'

import { routes } from 'utils/constants'
import { foundRoomsSelector } from 'ducks/rooms'

export const RoomsListContainer = () => {
  const rooms = useSelector(foundRoomsSelector)
  const history = useHistory()

  const roomsProps = useMemo<RoomsListProps['rooms']>(
    () =>
      rooms.map(({ uuid, name, playersCount, playersMaxCount }) => ({
        id: uuid,
        name,
        playersCount,
        playersMaxCount,
        onClick: () => history.push(generatePath(routes.GAME, { roomUuid: uuid })),
        isDisabled: playersCount === playersMaxCount,
      })),
    [history, rooms],
  )

  return <RoomsListComponent rooms={roomsProps} />
}
