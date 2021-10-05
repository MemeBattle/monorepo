import * as React from 'react'
import { useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { createRoomAction } from 'ducks/rooms'
import { CreateRoom } from '@memebattle/ligretto-ui'

export const CreateRoomContainer = () => {
  const dispatch = useDispatch()

  const onButtonClick = useCallback((e) => {
    const name: string = e.roomname.trim()

    dispatch(createRoomAction({ name }))
  }, [dispatch])

  return <CreateRoom onCreateClick={onButtonClick} />
}
