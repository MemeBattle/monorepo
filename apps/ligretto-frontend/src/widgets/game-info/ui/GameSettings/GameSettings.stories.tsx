import type { Meta, StoryObj } from '@storybook/react'
import { Provider } from 'react-redux'
import type { Player as GamePlayer } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState } from '#ducks/game'
import { createMockStore } from '#testing/lib/createMockStore'
import { GameSettings } from './GameSettings'

const users = [
  { sub: 'god', name: 'GOD' },
  { sub: 'guest', name: 'Guest' },
  { sub: 'marta', name: 'Marta' },
  { sub: 'anya', name: 'Anya' },
  { sub: 'kostya', name: 'Kostya' },
  { sub: 'ilya', name: 'Ilya' },
].map(user => ({ ...user, accountType: 'full' as const, avatarUrl: null }))

const spectatorIds = ['anya', 'kostya', 'ilya']

const createPlayer = (id: string, status: PlayerStatus, isHost = false): GamePlayer => ({
  id,
  isHost,
  status,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
})

const createStoryStore = (viewerId: string, gameStatus: GameStatus, players: GamePlayer[]) =>
  createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId: viewerId, isBootstrapped: true },
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
          status: gameStatus,
          players: Object.fromEntries(players.map(player => [player.id, player])),
          spectators: Object.fromEntries(spectatorIds.map(id => [id, { id }])),
        },
      },
    },
  })

const playersBetweenRounds = [
  createPlayer('god', PlayerStatus.DontReadyToPlay, true),
  createPlayer('guest', PlayerStatus.ReadyToPlay),
  createPlayer('marta', PlayerStatus.DontReadyToPlay),
]

const playersOnPause = [
  createPlayer('god', PlayerStatus.InGame, true),
  createPlayer('guest', PlayerStatus.InGame),
  createPlayer('marta', PlayerStatus.Disconnected),
]

const withStore = (store: ReturnType<typeof createMockStore>): Story['decorators'] => [
  Story => (
    <Provider store={store}>
      <Story />
    </Provider>
  ),
]

const meta: Meta<typeof GameSettings> = {
  title: 'Ligretto / GameSettings',
  component: GameSettings,
  decorators: [
    Story => (
      <div style={{ minHeight: '44rem', width: '60rem', maxWidth: '100%', display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    gameName: 'Friday night',
    gameStatus: GameStatus.RoundFinished,
    playersCount: 3,
    playersMaxCount: 4,
    canStartGame: false,
    canToggleReady: false,
    isStartDisabled: false,
    isPlayerReadyToPlay: false,
    onReadyClick: () => void 0,
    onExitClick: () => void 0,
    onStartClick: () => void 0,
  },
}
export default meta

type Story = StoryObj<typeof GameSettings>

export const Host: Story = {
  args: { canStartGame: true, canToggleReady: true },
  decorators: withStore(createStoryStore('god', GameStatus.RoundFinished, playersBetweenRounds)),
}

export const Player: Story = {
  args: { canToggleReady: true },
  decorators: withStore(createStoryStore('marta', GameStatus.RoundFinished, playersBetweenRounds)),
}

export const Spectator: Story = {
  decorators: withStore(createStoryStore('anya', GameStatus.RoundFinished, playersBetweenRounds)),
}

export const Paused: Story = {
  args: { gameStatus: GameStatus.Pause, canStartGame: true, isStartDisabled: true },
  decorators: withStore(createStoryStore('god', GameStatus.Pause, playersOnPause)),
}

export const Narrow: Story = {
  ...Host,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
