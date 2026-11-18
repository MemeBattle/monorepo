// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import type { Player } from '@memebattle/ligretto-shared'
import { becomeSpectatorEmitAction, GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState } from '#ducks/game'
import { createMockStore } from '#testing/lib/createMockStore'
import { SpectatorsList } from './SpectatorsList'

const createPlayer = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  isHost: false,
  status: PlayerStatus.DontReadyToPlay,
  cards: [],
  ligrettoDeck: { isHidden: true, cards: [] },
  stackOpenDeck: { isHidden: false, cards: [] },
  stackDeck: { isHidden: true, cards: [] },
  ...overrides,
})

const renderSpectatorsList = ({
  userId,
  status = GameStatus.RoundFinished,
  players = [createPlayer('host', { isHost: true }), createPlayer('peer')],
  spectatorIds = [],
}: {
  userId: string
  status?: GameStatus
  players?: Player[]
  spectatorIds?: string[]
}) => {
  const store = createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId, isBootstrapped: true },
      users: { ids: ['watcher'], entities: { watcher: { sub: 'watcher', name: 'Anya', accountType: 'full', avatarUrl: null } } },
      game: {
        ...initialState,
        game: {
          ...initialState.game,
          id: 'room-1',
          status,
          players: Object.fromEntries(players.map(player => [player.id, player])),
          spectators: Object.fromEntries(spectatorIds.map(id => [id, { id }])),
        },
      },
    },
  })
  const dispatch = vi.spyOn(store, 'dispatch')

  render(
    <Provider store={store}>
      <SpectatorsList />
    </Provider>,
  )

  return { dispatch }
}

describe('SpectatorsList', () => {
  it('lists the spectators by name and marks the viewer among them', () => {
    renderSpectatorsList({ userId: 'watcher', spectatorIds: ['watcher', 'other'] })

    expect(screen.getByText('Spectators · 2')).toBeTruthy()
    expect(screen.getByText('Anya')).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Spectate' })).toBeNull()
  })

  it('shows nothing when nobody watches and the viewer cannot spectate', () => {
    renderSpectatorsList({ userId: 'host' })

    expect(screen.queryByText(/^Spectators/)).toBeNull()
  })

  it('lets a player who is not the host spectate between rounds, even with nobody watching yet', () => {
    const { dispatch } = renderSpectatorsList({ userId: 'peer' })

    expect(screen.getByText('Spectators · 0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Spectate' }))

    expect(dispatch).toHaveBeenCalledWith(becomeSpectatorEmitAction({ gameId: 'room-1' }))
  })

  it.each([
    ['the host', 'host', GameStatus.New, PlayerStatus.DontReadyToPlay],
    ['a player during a round', 'peer', GameStatus.Pause, PlayerStatus.InGame],
    ['a disconnected player', 'peer', GameStatus.RoundFinished, PlayerStatus.Disconnected],
  ])('offers %s no way to spectate', (_label, userId, status, peerStatus) => {
    renderSpectatorsList({
      userId,
      status,
      players: [createPlayer('host', { isHost: true }), createPlayer('peer', { status: peerStatus })],
      spectatorIds: ['watcher'],
    })

    expect(screen.queryByRole('button', { name: 'Spectate' })).toBeNull()
  })
})
