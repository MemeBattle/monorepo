import type { Meta, StoryObj } from '@storybook/react'
import { CardColors, PlayerStatus } from '@memebattle/ligretto-shared'

import { Opponent } from './Opponent'

const meta: Meta<typeof Opponent> = {
  title: 'Ligretto / Opponent',
  component: Opponent,
  args: {
    id: 'opponent-id',
    username: 'Opponent',
    status: PlayerStatus.InGame,
    stackOpenDeckCards: [{ color: CardColors.blue, value: 3 }],
    cards: [
      { color: CardColors.red, value: 5 },
      { color: CardColors.green, value: 7 },
      { color: CardColors.yellow, value: 9 },
    ],
  },
}

export default meta

type Story = StoryObj<typeof Opponent>

export const Connected: Story = {}

export const Disconnected: Story = {
  args: {
    isDisconnected: true,
  },
}
