import type { Meta, StoryObj } from '@storybook/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import type { Player } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState } from '#ducks/game'
import { createMockStore } from '#testing/lib/createMockStore'
import { GameSettingsModal } from './GameSettingsModal'

const users = [
  { sub: 'god', name: 'GOD' },
  { sub: 'guest', name: 'Guest' },
  { sub: 'marta', name: 'Marta' },
  { sub: 'anya', name: 'Anya' },
  { sub: 'kostya', name: 'Kostya' },
  { sub: 'ilya', name: 'Ilya' },
].map(user => ({ ...user, accountType: 'full' as const, avatarUrl: null }))

const createPlayer = (id: string, status: PlayerStatus, isHost = false): Player => ({
  id,
  isHost,
  status,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
})

const players = [
  createPlayer('god', PlayerStatus.DontReadyToPlay, true),
  createPlayer('guest', PlayerStatus.ReadyToPlay),
  createPlayer('marta', PlayerStatus.DontReadyToPlay),
]

const createStoryStore = () =>
  createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId: 'god', isBootstrapped: true },
      users: { ids: users.map(user => user.sub), entities: Object.fromEntries(users.map(user => [user.sub, user])) },
      game: {
        ...initialState,
        isGameLoaded: true,
        results: {
          god: { roundScore: 14, gameScore: 31 },
          guest: { roundScore: 9, gameScore: 40 },
          marta: { roundScore: -3, gameScore: 12 },
        },
        game: {
          ...initialState.game,
          id: 'game',
          name: 'Friday night',
          status: GameStatus.RoundFinished,
          players: Object.fromEntries(players.map(player => [player.id, player])),
          spectators: Object.fromEntries(['anya', 'kostya', 'ilya'].map(id => [id, { id }])),
        },
      },
    },
  })

const meta: Meta<typeof GameSettingsModal> = {
  title: 'Ligretto / GameSettingsModal',
  component: GameSettingsModal,
  args: { isOpen: true },
  decorators: [
    Story => (
      <Provider store={createStoryStore()}>
        <MemoryRouter>
          <Story />
        </MemoryRouter>
      </Provider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof GameSettingsModal>

export const Desktop: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
}

export const Mobile: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
}

export const MobileLandscape: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: true } },
}
