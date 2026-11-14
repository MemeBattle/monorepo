import type { Meta, StoryObj } from '@storybook/react'
import { QueryClientProvider } from '@tanstack/react-query'

import { HomePage } from './HomePage'
import { history, store } from '#app/store'
import { createSeededQueryClient } from '#features/leader-board/ui/LeaderBoard/LeaderBoard.fixtures'
import { Provider } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'

const meta: Meta<typeof HomePage> = {
  title: 'Ligretto / pages / HomePage',
  component: HomePage,
  decorators: [
    Story => (
      <QueryClientProvider client={createSeededQueryClient()}>
        <Provider store={store}>
          <Router history={history}>
            <Story />
          </Router>
        </Provider>
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof HomePage>

export const Primary: Story = {
  render: () => <HomePage />,
}
