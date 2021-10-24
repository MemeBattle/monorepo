import React, { useMemo, useState } from 'react'
import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createRoomAction, selectRoomsError } from 'ducks/rooms'
import { CreateRoom } from '@memebattle/ligretto-ui'
import { roomNameValidation } from './utils'
import type { CreateRoomError } from '@memebattle/ligretto-shared/src/dto'

export const CreateRoomContainer = () => {
  const dispatch = useDispatch()

  const [name, setName] = useState('')
  const [dndEnabled, setDndEnabled] = useState(false)

  const roomsErrors: CreateRoomError | null = useSelector(selectRoomsError)

  const validationErrors: { error: string } | null = useMemo(() => roomNameValidation(name, roomsErrors), [name, roomsErrors])

  const handleNameChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    e => {
      setName(e.target.value)
    },
    [setName],
  )

  const handleDndChange = useCallback(() => {
    setDndEnabled(prev => !prev)
  }, [])

  const onButtonClick = useCallback(() => {
    const roomName = name.trim()
    dispatch(createRoomAction({ name: roomName, config: { dndEnabled } }))
  }, [dispatch, name, dndEnabled])

  return (
    <CreateRoom
      onRoomNameChange={handleNameChange}
      onCreateClick={onButtonClick}
      validationErrors={validationErrors}
      isCreateButtonDisabled={!name}
      onChangeDndEnabled={handleDndChange}
      dndEnabled={dndEnabled}
    />
  )
}
