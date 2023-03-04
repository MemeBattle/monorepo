import { CardsPanel } from './CardsPanel'
import type { ComponentMeta, ComponentStory } from '@storybook/react'
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
} as ComponentMeta<typeof CardsPanel>

export const Default: ComponentStory<typeof CardsPanel> = () => (
  <CardsPanel
    player={{
      status: PlayerStatus.InGame,
      username: 'Username',
    }}
  />
)
