import React, { useState } from 'react'
import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createRoomAction, selectRoomsErrors } from 'ducks/rooms'
import { CreateRoom } from '@memebattle/ligretto-ui'
import { roomNameValidation } from './utils'

export const CreateRoomContainer = () => {
  const dispatch = useDispatch()

  const [name, setName] = useState('')

  const roomsErrors: { error?: string } | null = useSelector(selectRoomsErrors)

  const validationErrors: { error?: string; name?: string } | null = roomNameValidation(name, roomsErrors)

  const handleNameChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    e => {
      setName(e.target.value.trim())
    },
    [setName],
  )

  const onButtonClick = useCallback(() => {
    dispatch(createRoomAction({ name }))
  }, [dispatch, name])

  return (
    <CreateRoom
      onRoomNameChange={handleNameChange}
      onCreateClick={onButtonClick}
      validationErrors={validationErrors}
      isCreateButtonDisabled={!name}
    />
  )
}
