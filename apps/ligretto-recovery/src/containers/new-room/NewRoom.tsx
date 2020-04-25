import * as React from 'react'
import { NewRoom } from 'components/blocks/new-room'
import { useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { createRoomAction } from 'ducks/rooms/actions'

export const NewRoomContainer = () => {
  const dispatch = useDispatch()

  const onButtonClick = useCallback(
    (name: string) => {
      dispatch(createRoomAction({ name }))
    },
    [dispatch],
  )
  return <NewRoom onCreateRoomButtonClick={onButtonClick} />
}
