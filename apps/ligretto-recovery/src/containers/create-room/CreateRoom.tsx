import * as React from 'react'
import { useCallback, useState } from 'react'
import { useDispatch } from 'react-redux'
import { createRoomAction } from 'ducks/rooms'
import { CreateRoom } from '@memebattle/ligretto-ui'

export const CreateRoomContainer = () => {
  const dispatch = useDispatch()

  const [name, setName] = useState('')

  const handleNameChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    e => {
      setName(e.target.value)
    },
    [setName],
  )

  const onButtonClick = useCallback(() => {
    dispatch(createRoomAction({ name }))
  }, [dispatch, name])

  return <CreateRoom onRoomNameChange={handleNameChange} onCreateClick={onButtonClick} />
}
