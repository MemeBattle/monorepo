import type { Meta, StoryObj } from '@storybook/react'
import { CardColors, PlayerStatus } from '@memebattle/ligretto-shared'
import { Stack } from '@memebattle/ui'

import { Opponent } from './Opponent'

const cards = [
  { color: CardColors.red, value: 5 },
  { color: CardColors.green, value: 7 },
  { color: CardColors.yellow, value: 9 },
]

const stackOpenDeckCards = [{ color: CardColors.blue, value: 3 }]

const meta: Meta<typeof Opponent> = {
  title: 'Ligretto / Opponent',
  component: Opponent,
  args: {
    id: 'opponent-id',
    username: 'Opponent',
    status: PlayerStatus.InGame,
    stackOpenDeckCards,
    cards,
  },
}

export default meta

type Story = StoryObj<typeof Opponent>

export const Connected: Story = {}

export const Disconnected: Story = {
  args: {
    status: PlayerStatus.Disconnected,
  },
}

export const MobileOpponents: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
  render: () => (
    <Stack sx={{ width: '100%' }}>
      <Opponent id="opponent-1" username="First" status={PlayerStatus.InGame} cards={cards} stackOpenDeckCards={stackOpenDeckCards} />
      <Opponent id="opponent-2" username="Second" status={PlayerStatus.InGame} cards={cards} stackOpenDeckCards={stackOpenDeckCards} />
      <Opponent id="opponent-3" username="Disconnected" status={PlayerStatus.Disconnected} cards={cards} stackOpenDeckCards={stackOpenDeckCards} />
    </Stack>
  ),
}
