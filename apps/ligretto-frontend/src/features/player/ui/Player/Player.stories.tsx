import type { Meta, StoryObj } from '@storybook/react'
import { Player } from './Player'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { Stack } from '@memebattle/ui'

const meta: Meta<typeof Player> = {
  title: 'Ligretto / Player',
  component: Player,
  argTypes: {
    status: {
      options: Object.values(PlayerStatus),
      control: { type: 'select' },
    },
    avatar: {
      control: { type: 'text' },
    },
  },
  args: {
    status: PlayerStatus.ReadyToPlay,
  },
}
export default meta

type Story = StoryObj<typeof Player>

export const DefaultView: Story = {
  args: {
    username: 'username',
    avatar: '',
    isActivePlayer: true,
  },
}

export const Opponent: Story = {
  render: () => (
    <Stack spacing={1}>
      <Player isActivePlayer={false} username="DontReadyToPlay long name" status={PlayerStatus.DontReadyToPlay} />
      <Player isActivePlayer={false} username="ReadyToPlay long name" status={PlayerStatus.ReadyToPlay} />
      <Player isActivePlayer={false} username="InGame long name" status={PlayerStatus.InGame} />
    </Stack>
  ),
}

export const CurrentPlayer: Story = {
  render: () => (
    <Stack spacing={1}>
      <Player isActivePlayer username="DontReadyToPlay long name" status={PlayerStatus.DontReadyToPlay} />
      <Player isActivePlayer username="ReadyToPlay long name" status={PlayerStatus.ReadyToPlay} />
      <Player isActivePlayer username="InGame long name" status={PlayerStatus.InGame} />
    </Stack>
  ),
}
