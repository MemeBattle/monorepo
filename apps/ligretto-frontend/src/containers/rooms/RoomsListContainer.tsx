import React, { useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RoomsListProps } from '@memebattle/ui'
import { RoomsList as RoomsListComponent } from '@memebattle/ui'
import { useHistory, generatePath } from 'react-router'

import { routes } from 'utils/constants'
import { roomsListSelector } from 'ducks/rooms'

export const RoomsListContainer = () => {
  const rooms = useSelector(roomsListSelector)
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

RoomsListContainer.displayName = 'RoomsList'
