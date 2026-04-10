import type { Meta, StoryObj } from '@storybook/react'
import { Provider } from 'react-redux'
import { history, store } from '#app/store'
import { GamePage } from './GamePage'
import { createMockStore } from '#testing/lib/createMockStore'
import { initialState as gameInitialState } from '#ducks/game'
import { authInitialState } from '#ducks/auth/authSlice'
import type { Player } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'
import { HistoryRouter as Router } from 'redux-first-history/rr6'

const meta: Meta<typeof GamePage> = {
  title: 'Ligretto / pages / GamePageContainer',
  component: GamePage,
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

type Story = StoryObj<typeof GamePage>

const createPlayerState = (partialPlayer: Partial<Player> & { id: Player['id'] }): Player => ({
  isHost: false,
  status: PlayerStatus.DontReadyToPlay,
  cards: [],
  stackDeck: { cards: [], isHidden: true },
  stackOpenDeck: { cards: [], isHidden: true },
  ligrettoDeck: { cards: [], isHidden: true },
  ...partialPlayer,
})

export const Loading: Story = {
  decorators: [
    Story => (
      <Provider store={createMockStore({ preloadedState: { game: { ...gameInitialState } } })}>
        <Story />
      </Provider>
    ),
  ],
}

export const OnlyPlayerWaiting: Story = {
  decorators: [
    Story => (
      <Provider
        store={createMockStore({
          preloadedState: {
            auth: { ...authInitialState, userId: 'userId' },
            users: {
              ids: ['userId'],
              entities: { userId: { username: 'Username', isTemporary: false, casId: 'userId' } },
            },
            game: {
              ...gameInitialState,
              isGameLoaded: true,
              game: { ...gameInitialState.game, name: 'Example game name', players: { userId: createPlayerState({ id: 'userId', isHost: true }) } },
            },
          },
        })}
      >
        <Story />
      </Provider>
    ),
  ],
}

export const TwoPlayersWaiting: Story = {
  decorators: [
    Story => (
      <Provider
        store={createMockStore({
          preloadedState: {
            auth: { ...authInitialState, userId: 'userId' },
            users: {
              ids: ['userId'],
              entities: {
                userId: { username: 'Username', isTemporary: false, casId: 'userId' },
                secondUserId1: { username: 'Second user with long name', isTemporary: false, casId: 'secondUserId1' },
              },
            },
            game: {
              ...gameInitialState,
              isGameLoaded: true,
              game: {
                ...gameInitialState.game,
                name: 'Example game name',
                players: {
                  userId: createPlayerState({ id: 'userId', isHost: true }),
                  secondUserId1: createPlayerState({ id: 'secondUserId1', status: PlayerStatus.ReadyToPlay }),
                },
              },
            },
          },
        })}
      >
        <Story />
      </Provider>
    ),
  ],
}

export const ThreePlayersWaiting: Story = {
  decorators: [
    Story => (
      <Provider
        store={createMockStore({
          preloadedState: {
            auth: { ...authInitialState, userId: 'userId' },
            users: {
              ids: ['userId'],
              entities: {
                userId: { username: 'Username', isTemporary: false, casId: 'userId' },
                secondUserId1: { username: 'Second user with long name', isTemporary: false, casId: 'secondUserId1' },
                thirdUserId2: { isTemporary: true, casId: 'thirdUserId2' },
              },
            },
            game: {
              ...gameInitialState,
              isGameLoaded: true,
              game: {
                ...gameInitialState.game,
                name: 'Example game name',
                players: {
                  userId: createPlayerState({ id: 'userId', isHost: true }),
                  secondUserId1: createPlayerState({ id: 'secondUserId1', status: PlayerStatus.ReadyToPlay }),
                  thirdUserId2: createPlayerState({ id: 'thirdUserId2' }),
                },
              },
            },
          },
        })}
      >
        <Story />
      </Provider>
    ),
  ],
}

export const FourthPlayersWaiting: Story = {
  decorators: [
    Story => (
      <Provider
        store={createMockStore({
          preloadedState: {
            auth: { ...authInitialState, userId: 'userId' },
            users: {
              ids: ['userId'],
              entities: {
                userId: { username: 'Username', isTemporary: false, casId: 'userId' },
                secondUserId1: { username: 'Second user with long name', isTemporary: false, casId: 'secondUserId1' },
                thirdUserId2: { isTemporary: true, casId: 'thirdUserId2' },
                fourthUserId3: { isTemporary: true, casId: 'fourthUserId3' },
              },
            },
            game: {
              ...gameInitialState,
              isGameLoaded: true,
              game: {
                ...gameInitialState.game,
                name: 'Example game name',
                players: {
                  userId: createPlayerState({ id: 'userId', isHost: true }),
                  secondUserId1: createPlayerState({ id: 'secondUserId1', status: PlayerStatus.ReadyToPlay }),
                  thirdUserId2: createPlayerState({ id: 'thirdUserId2' }),
                  fourthUserId3: createPlayerState({ id: 'fourthUserId3', status: PlayerStatus.ReadyToPlay }),
                },
              },
            },
          },
        })}
      >
        <Story />
      </Provider>
    ),
  ],
}

export const TwoPlayersInGame: Story = {
  decorators: [
    Story => (
      <Provider
        store={createMockStore({
          preloadedState: {
            auth: { ...authInitialState, userId: 'userId' },
            users: {
              ids: ['userId'],
              entities: {
                userId: { username: 'Username', isTemporary: false, casId: 'userId' },
                secondUserId1: { username: 'Second user with long name', isTemporary: false, casId: 'secondUserId1' },
              },
            },
            game: {
              ...gameInitialState,
              isGameLoaded: true,
              game: {
                ...gameInitialState.game,
                name: 'Example game name',
                status: GameStatus.InGame,
                players: {
                  userId: createPlayerState({ id: 'userId', isHost: true, status: PlayerStatus.InGame, cards: [null, null, null, null, null] }),
                  secondUserId1: createPlayerState({ id: 'secondUserId1', status: PlayerStatus.InGame, cards: [null, null, null, null, null] }),
                },
              },
            },
          },
        })}
      >
        <Story />
      </Provider>
    ),
  ],
}

export const ThreePlayersInGame: Story = {
  decorators: [
    Story => (
      <Provider
        store={createMockStore({
          preloadedState: {
            auth: { ...authInitialState, userId: 'userId' },
            users: {
              ids: ['userId'],
              entities: {
                userId: { username: 'Username', isTemporary: false, casId: 'userId' },
                secondUserId1: { username: 'Second user with long name', isTemporary: false, casId: 'secondUserId1' },
                thirdUserId2: { isTemporary: true, casId: 'thirdUserId2' },
              },
            },
            game: {
              ...gameInitialState,
              isGameLoaded: true,
              game: {
                ...gameInitialState.game,
                name: 'Example game name',
                status: GameStatus.InGame,
                players: {
                  userId: createPlayerState({ id: 'userId', isHost: true, status: PlayerStatus.InGame, cards: [null, null, null, null] }),
                  secondUserId1: createPlayerState({ id: 'secondUserId1', status: PlayerStatus.InGame, cards: [null, null, null, null] }),
                  thirdUserId2: createPlayerState({ id: 'thirdUserId2', status: PlayerStatus.InGame, cards: [null, null, null, null] }),
                },
              },
            },
          },
        })}
      >
        <Story />
      </Provider>
    ),
  ],
}

export const FourPlayersInGame: Story = {
  decorators: [
    Story => (
      <Provider
        store={createMockStore({
          preloadedState: {
            auth: { ...authInitialState, userId: 'userId' },
            users: {
              ids: ['userId'],
              entities: {
                userId: { username: 'Username', isTemporary: false, casId: 'userId' },
                secondUserId1: { username: 'Second user with long name', isTemporary: false, casId: 'secondUserId1' },
                thirdUserId2: { isTemporary: true, casId: 'thirdUserId2' },
                fourthUserId3: { isTemporary: true, casId: 'fourthUserId3' },
              },
            },
            game: {
              ...gameInitialState,
              isGameLoaded: true,
              game: {
                ...gameInitialState.game,
                name: 'Example game name',
                status: GameStatus.InGame,
                players: {
                  userId: createPlayerState({ id: 'userId', isHost: true, status: PlayerStatus.InGame, cards: [null, null, null] }),
                  secondUserId1: createPlayerState({ id: 'secondUserId1', status: PlayerStatus.InGame, cards: [null, null, null] }),
                  thirdUserId2: createPlayerState({ id: 'thirdUserId2', status: PlayerStatus.InGame, cards: [null, null, null] }),
                  fourthUserId3: createPlayerState({ id: 'fourthUserId3', status: PlayerStatus.InGame, cards: [null, null, null] }),
                },
              },
            },
          },
        })}
      >
        <Story />
      </Provider>
    ),
  ],
}

export const FourPlayersStarting: Story = {
  decorators: [
    Story => (
      <Provider
        store={createMockStore({
          preloadedState: {
            auth: { ...authInitialState, userId: 'userId' },
            users: {
              ids: ['userId'],
              entities: {
                userId: { username: 'Username', isTemporary: false, casId: 'userId' },
                secondUserId1: { username: 'Second user with long name', isTemporary: false, casId: 'secondUserId1' },
                thirdUserId2: { isTemporary: true, casId: 'thirdUserId2' },
                fourthUserId3: { isTemporary: true, casId: 'fourthUserId3' },
              },
            },
            game: {
              ...gameInitialState,
              isGameLoaded: true,
              game: {
                ...gameInitialState.game,
                name: 'Example game name',
                status: GameStatus.Starting,
                players: {
                  userId: createPlayerState({ id: 'userId', isHost: true, status: PlayerStatus.InGame, cards: [null, null, null] }),
                  secondUserId1: createPlayerState({ id: 'secondUserId1', status: PlayerStatus.InGame, cards: [null, null, null] }),
                  thirdUserId2: createPlayerState({ id: 'thirdUserId2', status: PlayerStatus.InGame, cards: [null, null, null] }),
                  fourthUserId3: createPlayerState({ id: 'fourthUserId3', status: PlayerStatus.InGame, cards: [null, null, null] }),
                },
              },
            },
          },
        })}
      >
        <Story />
      </Provider>
    ),
  ],
}
