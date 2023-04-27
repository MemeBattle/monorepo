import { CardsPanel } from './CardsPanel'
import type { Meta, StoryFn } from '@storybook/react'
import { PlayerStatus } from '@memebattle/ligretto-shared'
import { Provider } from 'react-redux'
import { store } from 'store'

export default {
  component: CardsPanel,
  title: 'Ligretto / CardsPanel',
  decorators: [
    Story => (
      <Provider store={store}>
        <Story />
      </Provider>
    ),
  ],
} as Meta<typeof CardsPanel>

export const Default: StoryFn<typeof CardsPanel> = () => (
  <CardsPanel
    player={{
      status: PlayerStatus.InGame,
      username: 'Username',
    }}
  />
)
