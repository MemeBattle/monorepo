import type { Meta, StoryObj } from '@storybook/react'
import { CardsPanel } from './CardsPanel'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { Provider } from 'react-redux'
import { store } from '#app/store'

const meta: Meta<typeof CardsPanel> = {
  component: CardsPanel,
  title: 'Ligretto / CardsPanel',
  decorators: [
    Story => (
      <Provider store={store}>
        <Story />
      </Provider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof CardsPanel>

export const Default: Story = {
  render: () => (
    <CardsPanel
      player={{
        status: PlayerStatus.InGame,
        username: 'Username',
      }}
    />
  ),
}
