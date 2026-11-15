import type { Meta, StoryObj } from '@storybook/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'

import { history, store } from '#app/store'
import { LeaderBoard } from './LeaderBoard'
import { createSeededQueryClient } from './LeaderBoard.fixtures'

const meta: Meta<typeof LeaderBoard> = {
  title: 'Ligretto / LeaderBoard',
  component: LeaderBoard,
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
type Story = StoryObj<typeof LeaderBoard>

export const Default: Story = {}

export const Narrow: Story = {
  render: () => (
    <div style={{ width: '20rem' }}>
      <LeaderBoard />
    </div>
  ),
}
