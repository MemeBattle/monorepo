import type { Meta, StoryObj } from '@storybook/react'

import { RoomsList } from './RoomsList'

const meta: Meta<typeof RoomsList> = {
  title: 'Ligretto / RoomsList',
  component: RoomsList,
}
export default meta

type Story = StoryObj<typeof RoomsList>

export const DefaultView: Story = {
  render: () => (
    <RoomsList
      rooms={[
        { id: '1', name: 'Room name 1', onClick: () => null, playersCount: 1, playersMaxCount: 4 },
        { id: '2', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4 },
        { id: '3', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4 },
        {
          id: '4',
          name: 'Room name 2 Long name long long long long name Room name 2 Long name long long long long name Room name 2 Long name long long long long name Room name 2 Long name long long long long name',
          onClick: () => null,
          playersCount: 4,
          playersMaxCount: 4,
        },
        { id: '5', name: 'Room name 2', onClick: () => null, playersCount: 4, playersMaxCount: 4, isDisabled: true },
      ]}
    />
  ),
}

export const EmptyRooms: Story = {
  render: () => <RoomsList rooms={[]} />,
}
