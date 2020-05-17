import * as React from 'react'
import { CreateRoom } from 'components/blocks/create-room/create-room'
import { useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { createRoomAction } from 'ducks/rooms/actions'

export const CreateRoomContainer = () => {
  const dispatch = useDispatch()

  const onButtonClick = useCallback(
    ({ name, password }: { name: string, password: string }) => {
      dispatch(createRoomAction({ name, password }))
    },
    [dispatch],
  )
  return <CreateRoom onCreateRoomButtonClick={onButtonClick} />
}
