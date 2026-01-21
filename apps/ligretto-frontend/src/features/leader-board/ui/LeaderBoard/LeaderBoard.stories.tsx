import type { Meta, StoryObj } from '@storybook/react'
import { LeaderBoard } from './LeaderBoard'
import { history, store } from '#app/store'
import { Provider } from 'react-redux'
import { HistoryRouter as Router } from 'redux-first-history/rr6'

const meta: Meta<typeof LeaderBoard> = {
  component: LeaderBoard,
  title: 'Ligretto / features / LeaderBoard',
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
type Story = StoryObj<typeof LeaderBoard>

export const Default: Story = {
  args: {
    leaders: {
      day: [
        {
          avatar: 'https://robohash.org/hicveldicta.png',
          totalPoints: 2000,
          username: 'Terry Medhurst',
        },
        {
          avatar: 'https://robohash.org/doloremquesintcorrupti.png',
          totalPoints: 1950,
          username: 'Sheldon Quigley',
        },
        {
          avatar: 'https://robohash.org/consequunturautconsequatur.png',
          totalPoints: 1900,
          username: 'Terrill Hills',
        },
        {
          avatar: 'https://robohash.org/facilisdignissimosdolore.png',
          totalPoints: 1850,
          userPlace: 15,
          username: 'Miles Cummerata',
        },
      ],
      month: [
        {
          avatar: 'https://robohash.org/adverovelit.png',
          totalPoints: 2000,
          username: 'Mavis Schultz',
        },
        {
          avatar: 'https://robohash.org/laboriosamfacilisrem.png',
          totalPoints: 1950,
          username: 'Alison Reichert',
        },
        {
          avatar: 'https://robohash.org/cupiditatererumquos.png',
          totalPoints: 1900,
          username: 'Oleta Abbott',
        },
        {
          avatar: 'https://robohash.org/quiaharumsapiente.png',
          totalPoints: 1850,
          userPlace: 15,
          username: 'Ewell Mueller',
        },
      ],
      all: [
        {
          avatar: 'https://robohash.org/excepturiiuremolestiae.png',
          totalPoints: 2000,
          username: 'Demetrius Corkery',
        },
        {
          avatar: 'https://robohash.org/aliquamcumqueiure.png',
          totalPoints: 1950,
          username: 'Eleanora Price',
        },
        { avatar: 'https://robohash.org/impeditautest.png', totalPoints: 1900, username: 'Marcel Jones' },
        {
          avatar: 'https://robohash.org/namquaerataut.png',
          totalPoints: 1850,
          userPlace: 15,
          username: 'Assunta Rath',
        },
      ],
    },
  },
}
