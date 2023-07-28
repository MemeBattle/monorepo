import React, { useMemo, useState, useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { CreateRoomError } from '@memebattle/ligretto-shared/src/dto'

import { createRoomAction, roomsErrorSelector } from 'ducks/rooms'

import { roomNameValidation } from './utils'
import { InputWithButton } from 'components/InputWithButton'
import { Typography } from '@memebattle/ui'

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

  const handleCreateRoom = useCallback(() => {
    if (name.trim() !== '' && !validationErrors) {
      dispatch(createRoomAction({ name, config: { dndEnabled: true } }))
    }
  }, [name, validationErrors, dispatch])

  const handleCreateRoomKeyDown = useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
    e => {
      if (e.key === 'Enter') {
        handleCreateRoom()
      }
    },
    [handleCreateRoom],
  )

  return (
    <InputWithButton>
      <InputWithButton.Input
        inputProps={{ 'data-test-id': 'CreateGameInput' }}
        placeholder="Room name..."
        onChange={handleNameChange}
        onKeyDown={handleCreateRoomKeyDown}
      />
      <InputWithButton.ButtonWrapper>
        <InputWithButton.Button data-test-id="CreateGameButton" onClick={handleCreateRoom} disabled={!name || !!validationErrors} variant="contained">
          <Typography fontSize="inherit">Create</Typography>
        </InputWithButton.Button>
      </InputWithButton.ButtonWrapper>
    </InputWithButton>
  )
}
