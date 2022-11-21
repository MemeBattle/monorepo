import React, { useCallback, useState } from 'react'
import { InputWithButton } from './InputWithButton'
import { Typography } from '@memebattle/ui'
import CachedIcon from '@mui/icons-material/Cached'

export default {
  title: 'Ligretto / InputWithButton',
}

export const Search = () => {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleSearchRoomsClick = React.useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  return (
    <div style={{ width: '35rem' }}>
      <InputWithButton>
        <InputWithButton.Input inputRef={inputRef} placeholder="Search..." />
        <InputWithButton.ButtonWrapper onClick={handleSearchRoomsClick}>
          <InputWithButton.IconWrapper>
            <CachedIcon fontSize="inherit" />
          </InputWithButton.IconWrapper>
        </InputWithButton.ButtonWrapper>
      </InputWithButton>
    </div>
  )
}

export const CreateRoom = () => {
  const [name, setName] = useState('')

  const handleNameChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    e => {
      setName(e.target.value)
    },
    [setName],
  )

  return (
    <div style={{ width: '35rem' }}>
      <InputWithButton>
        <InputWithButton.Input placeholder="Room name..." onChange={handleNameChange} />
        <InputWithButton.ButtonWrapper>
          <InputWithButton.Button disabled={!name} variant="contained">
            <Typography fontSize="inherit">Create</Typography>
          </InputWithButton.Button>
        </InputWithButton.ButtonWrapper>
      </InputWithButton>
    </div>
  )
}
