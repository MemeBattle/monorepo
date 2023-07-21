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

  const handleCreateRoomClick = useCallback(() => {
    const roomName = name.trim()
    dispatch(createRoomAction({ name: roomName, config: { dndEnabled: true } }))
  }, [dispatch, name])

  const handleCreateRoomPressEnter = useCallback<React.KeyboardEventHandler<HTMLInputElement>>(
    e => {
      if (e.key === 'Enter' && name.trim() !== '') {
        handleCreateRoomClick()
      }
    },
    [name, handleCreateRoomClick],
  )

  return (
    <InputWithButton>
      <InputWithButton.Input
        inputProps={{ 'data-test-id': 'CreateGameInput' }}
        placeholder="Room name..."
        onChange={handleNameChange}
        onKeyDown={handleCreateRoomPressEnter}
      />
      <InputWithButton.ButtonWrapper>
        <InputWithButton.Button
          data-test-id="CreateGameButton"
          onClick={handleCreateRoomClick}
          disabled={!name || !!validationErrors}
          variant="contained"
        >
          <Typography fontSize="inherit">Create</Typography>
        </InputWithButton.Button>
      </InputWithButton.ButtonWrapper>
    </InputWithButton>
  )
}
