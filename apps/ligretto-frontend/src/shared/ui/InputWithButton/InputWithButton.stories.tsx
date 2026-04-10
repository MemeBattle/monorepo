import { useCallback, useRef, useState } from 'react'
import type { ChangeEventHandler } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { InputWithButton } from './InputWithButton'
import { Typography } from '@memebattle/ui'
import CachedIcon from '@mui/icons-material/Cached'

const meta: Meta<typeof InputWithButton> = {
  title: 'Ligretto / InputWithButton',
  component: InputWithButton,
}
export default meta

type Story = StoryObj<typeof InputWithButton>

const SearchStory = () => {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearchRoomsClick = useCallback(() => {
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

export const Search: Story = {
  render: () => <SearchStory />,
}

const CreateRoomStory = () => {
  const [name, setName] = useState('')

  const handleNameChange = useCallback<ChangeEventHandler<HTMLInputElement>>(e => {
    setName(e.target.value)
  }, [])

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

export const CreateRoom: Story = {
  render: () => <CreateRoomStory />,
}
