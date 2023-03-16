import { Player } from './Player'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import type { ComponentMeta, ComponentStory } from '@storybook/react'
import { Stack } from '@memebattle/ui'

export default {
  title: 'Ligretto / Player',
  component: Player,
  argTypes: {
    status: {
      options: Object.values(PlayerStatus),
      control: {
        type: 'select',
      },
      defaultValue: PlayerStatus.ReadyToPlay,
    },
    avatar: {
      control: {
        type: 'text',
      },
    },
  },
} as ComponentMeta<typeof Player>

const Template: ComponentStory<typeof Player> = args => <Player {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  username: 'username',
  avatar: '',
  isActivePlayer: true,
}

export const Opponent = () => (
  <Stack spacing={1}>
    <Player isActivePlayer={false} username="DontReadyToPlay long name" status={PlayerStatus.DontReadyToPlay} />
    <Player isActivePlayer={false} username="ReadyToPlay long name" status={PlayerStatus.ReadyToPlay} />
    <Player isActivePlayer={false} username="InGame long name" status={PlayerStatus.InGame} />
  </Stack>
)

export const CurrentPlayer = () => (
  <Stack spacing={1}>
    <Player isActivePlayer username="DontReadyToPlay long name" status={PlayerStatus.DontReadyToPlay} />
    <Player isActivePlayer username="ReadyToPlay long name" status={PlayerStatus.ReadyToPlay} />
    <Player isActivePlayer username="InGame long name" status={PlayerStatus.InGame} />
  </Stack>
)
