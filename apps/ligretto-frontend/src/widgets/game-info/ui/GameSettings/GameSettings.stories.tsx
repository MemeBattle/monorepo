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

const createStoryStore = (viewerId: string, gameStatus: GameStatus, players: GamePlayer[], spectators = spectatorIds) =>
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
          spectators: Object.fromEntries(spectators.map(id => [id, { id }])),
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
    isSpectatorBetweenRounds: false,
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

export const PlayerSpectating: Story = {
  args: { playersCount: 2, isSpectatorBetweenRounds: true },
  decorators: withStore(createStoryStore('marta', GameStatus.RoundFinished, playersBetweenRounds.slice(0, 2), [...spectatorIds, 'marta'])),
}

export const Spectator: Story = {
  args: { isSpectatorBetweenRounds: true },
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

export const PlayerNarrow: Story = {
  ...Player,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

export const PlayerSpectatingNarrow: Story = {
  ...PlayerSpectating,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}
