import type { Meta, StoryObj } from '@storybook/react'

import { HomePage } from './HomePage'
import { history, store } from '#app/store'
import { Provider } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'

const meta: Meta<typeof HomePage> = {
  title: 'Ligretto / pages / HomePage',
  component: HomePage,
  decorators: [
    Story => (
      <Provider store={store}>
        <Router history={history}>
          <Story />
        </Router>
      </Provider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof HomePage>

export const Primary: Story = {
  render: () => <HomePage />,
}
