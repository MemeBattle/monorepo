import React, { useMemo, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { CreateRoomError } from '@memebattle/ligretto-shared/src/dto'

import { createRoomAction, roomsErrorSelector } from 'ducks/rooms'

import { roomNameValidation } from './utils'
import { InputWithButton } from 'components/InputWithButton'
import { InputWithButtonTypes } from '@memebattle/ligretto-shared'

export const CreateRoomContainer = () => {
  const dispatch = useDispatch()

  const [name, setName] = useState('')

  const roomsErrors: CreateRoomError | null = useSelector(roomsErrorSelector)

  const validationErrors: { error: string } | null = useMemo(() => roomNameValidation(name, roomsErrors), [name, roomsErrors])

  const handleNameChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    e => {
      setName(e.target.value)
    },
    [setName],
  )

  const onButtonClick = useCallback(() => {
    const roomName = name.trim()
    dispatch(createRoomAction({ name: roomName, config: { dndEnabled: true } }))
  }, [dispatch, name])

  return (
    <InputWithButton
      type={InputWithButtonTypes.createRoom}
      onRoomNameChange={handleNameChange}
      onCreateClick={onButtonClick}
      validationErrors={validationErrors}
      isButtonDisabled={!name}
      placeholder="Room name.."
    />
  )
}
