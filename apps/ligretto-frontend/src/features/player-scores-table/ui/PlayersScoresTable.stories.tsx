import type { Meta, StoryObj } from '@storybook/react'
import { PlayersScoresTable } from './PlayersScoresTable'

const players = [
  { id: '1', username: 'Player', roundPoints: [4, 12], totalPoints: 16, isPlayer: true },
  {
    id: '2',
    username: 'AVeryLongUsernameWithoutAnySpacesThatDoesNotFitIntoTheColumn',
    roundPoints: [-2, 7],
    totalPoints: 5,
    isPlayer: false,
  },
  { id: '3', username: 'A long username with spaces that does not fit either', roundPoints: [9, -1], totalPoints: 8, isPlayer: false },
]

const meta: Meta<typeof PlayersScoresTable> = {
  title: 'Ligretto / PlayersScoresTable',
  component: PlayersScoresTable,
}
export default meta

type Story = StoryObj<typeof PlayersScoresTable>

export const Default: Story = {
  render: () => (
    <div style={{ width: '44rem', display: 'flex' }}>
      <PlayersScoresTable players={players} />
    </div>
  ),
}

export const Narrow: Story = {
  render: () => (
    <div style={{ width: '20rem', display: 'flex' }}>
      <PlayersScoresTable players={players} />
    </div>
  ),
}
