import React from 'react'
import { Player } from './Player'
import { PlayerStatus } from '@memebattle/ligretto-shared'

export default {
  title: 'Player',
  component: Player,
  argTypes: {
    status: {
      options: Object.values(PlayerStatus),
      control: {
        type: 'select',
      },
    },
  },
}

const Template = args => <Player {...args} />

export const DefaultView = Template.bind({})
DefaultView.args = {
  username: 'username',
  avatar: '',
}
