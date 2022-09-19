import { Player } from './Player'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import type { ComponentMeta, ComponentStory } from '@storybook/react'

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
