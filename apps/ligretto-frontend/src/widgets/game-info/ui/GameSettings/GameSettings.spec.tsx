// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import type { Player } from '@memebattle/ligretto-shared'
import { becomePlayerEmitAction, becomeSpectatorEmitAction, GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { createMockStore } from '#testing/lib/createMockStore'
import { initialState, resumeGameAction, togglePlayerStatusAction, updateGameAction } from '#ducks/game'
import { GameSettingsContainer } from './GameSettingsContainer'

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

const freeSeatRows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-test-id="PlayersScoresTable-FreeSeat"]'))

const renderGameSettings = ({
  userId,
  status,
  players,
  spectatorIds = [],
}: {
  userId: string
  status: GameStatus
  players: Player[]
  spectatorIds?: string[]
}) => {
  const store = createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId, isBootstrapped: true },
      game: {
        ...initialState,
        game: {
          ...initialState.game,
          id: 'game',
          name: 'Friday night',
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
      <MemoryRouter>
        <GameSettingsContainer />
      </MemoryRouter>
    </Provider>,
  )

  return { dispatch, store }
}

describe('GameSettings', () => {
  it('shows the room, its seats and its spectators', () => {
    renderGameSettings({
      userId: 'host',
      status: GameStatus.New,
      players: [createPlayer('host', { isHost: true }), createPlayer('peer', { status: PlayerStatus.ReadyToPlay })],
      spectatorIds: ['watcher-1', 'watcher-2'],
    })

    expect(screen.getByText('Friday night')).toBeTruthy()
    expect(screen.getByText('2/4 players')).toBeTruthy()
    expect(screen.getAllByText('Free seat')).toHaveLength(2)
    expect(screen.getByText('Spectators · 2')).toBeTruthy()
    expect(screen.getByText('Host')).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
  })

  it('lets the host mark themselves ready and start the round', () => {
    const { dispatch } = renderGameSettings({
      userId: 'host',
      status: GameStatus.RoundFinished,
      players: [createPlayer('host', { isHost: true }), createPlayer('peer')],
    })

    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }))
    expect(dispatch).toHaveBeenCalledWith(togglePlayerStatusAction())
    expect((screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('dispatches the resume flow when the host resumes a paused round', () => {
    const { dispatch } = renderGameSettings({
      userId: 'host',
      status: GameStatus.Pause,
      players: [createPlayer('host', { isHost: true, status: PlayerStatus.InGame }), createPlayer('peer', { status: PlayerStatus.InGame })],
    })

    expect(screen.getByText('Round is paused')).toBeTruthy()
    const resumeButton = screen.getByRole('button', { name: 'Resume' }) as HTMLButtonElement
    expect(resumeButton.disabled).toBe(false)
    fireEvent.click(resumeButton)

    expect(dispatch).toHaveBeenCalledWith(resumeGameAction())
  })

  it('disables host resume until two players are online', () => {
    renderGameSettings({
      userId: 'host',
      status: GameStatus.Pause,
      players: [createPlayer('host', { isHost: true, status: PlayerStatus.InGame }), createPlayer('peer', { status: PlayerStatus.Disconnected })],
    })

    expect((screen.getByRole('button', { name: 'Resume' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('gives a non-host player nothing to do while the round is paused', () => {
    renderGameSettings({
      userId: 'peer',
      status: GameStatus.Pause,
      players: [createPlayer('host', { isHost: true, status: PlayerStatus.InGame }), createPlayer('peer', { status: PlayerStatus.InGame })],
    })

    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
    expect(screen.queryByRole('button', { name: "I'm ready" })).toBeNull()
    expect(screen.getByRole('button', { name: 'Leave room' })).toBeTruthy()
  })

  it('marks the spectator who is viewing and offers them a free seat, not the controls of a player', () => {
    const { dispatch } = renderGameSettings({
      userId: 'watcher',
      status: GameStatus.New,
      players: [createPlayer('host', { isHost: true }), createPlayer('peer')],
      spectatorIds: ['watcher'],
    })

    expect(screen.getByText('You')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull()
    expect(screen.queryByRole('button', { name: "I'm ready" })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Spectate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Leave room' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sit here' }))
    expect(dispatch).toHaveBeenCalledWith(becomePlayerEmitAction({ gameId: 'game' }))
  })

  it('offers a spectator only the first of several free seats', () => {
    renderGameSettings({ userId: 'watcher', status: GameStatus.New, players: [createPlayer('host', { isHost: true })], spectatorIds: ['watcher'] })

    const [firstSeat, ...otherSeats] = freeSeatRows()
    expect(otherSeats).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Sit here' })).toHaveLength(1)
    expect(within(firstSeat).getByRole('button', { name: 'Sit here' })).toBeTruthy()
    otherSeats.forEach(seat => {
      expect(within(seat).getByText('Free seat')).toBeTruthy()
      expect(within(seat).queryByRole('button', { name: 'Sit here' })).toBeNull()
    })
  })

  it('moves the offered seat to the first one still free as players take and leave seats', () => {
    const host = createPlayer('host', { isHost: true })
    const { store } = renderGameSettings({ userId: 'watcher', status: GameStatus.RoundFinished, players: [host], spectatorIds: ['watcher'] })
    const seatPlayers = (...players: Player[]) =>
      act(() => {
        store.dispatch(updateGameAction({ ...store.getState().game.game, players: Object.fromEntries(players.map(player => [player.id, player])) }))
      })
    const expectSeatOfferedAtFirstOf = (freeSeatsCount: number) => {
      const seats = freeSeatRows()
      expect(seats).toHaveLength(freeSeatsCount)
      expect(screen.getAllByRole('button', { name: 'Sit here' })).toHaveLength(1)
      expect(within(seats[0]).getByRole('button', { name: 'Sit here' })).toBeTruthy()
    }

    expectSeatOfferedAtFirstOf(3)

    seatPlayers(host, createPlayer('a'))
    expectSeatOfferedAtFirstOf(2)

    seatPlayers(host, createPlayer('a'), createPlayer('b'), createPlayer('c'))
    expect(freeSeatRows()).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Sit here' })).toBeNull()

    seatPlayers(host, createPlayer('c'))
    expectSeatOfferedAtFirstOf(2)
  })

  it.each([
    ['in a full room', GameStatus.RoundFinished, ['host', 'a', 'b', 'c']],
    ['while the round is starting', GameStatus.Starting, ['host']],
    ['during a round', GameStatus.InGame, ['host']],
    ['while the round is paused', GameStatus.Pause, ['host']],
  ])('offers a spectator no seat %s', (_label, status, playerIds) => {
    const players = playerIds.map(id => createPlayer(id, { isHost: id === 'host' }))
    renderGameSettings({ userId: 'watcher', status, players, spectatorIds: ['watcher'] })

    expect(screen.queryByRole('button', { name: 'Sit here' })).toBeNull()
  })

  it('offers a seated player no seat, only invites, at every free seat', () => {
    renderGameSettings({ userId: 'peer', status: GameStatus.RoundFinished, players: [createPlayer('host', { isHost: true }), createPlayer('peer')] })

    expect(freeSeatRows()).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Invite friends to join you!' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Sit here' })).toBeNull()
  })

  it('moves the viewer to the table, with the controls of a player, once the server seats them', () => {
    const host = createPlayer('host', { isHost: true })
    const { store } = renderGameSettings({ userId: 'watcher', status: GameStatus.RoundFinished, players: [host], spectatorIds: ['watcher'] })
    expect(screen.getByText('Spectators · 1')).toBeTruthy()

    act(() => {
      store.dispatch(updateGameAction({ ...store.getState().game.game, players: { host, watcher: createPlayer('watcher') }, spectators: {} }))
    })

    expect(screen.getByText('Spectators · 0')).toBeTruthy()
    expect(screen.getByText('2/4 players')).toBeTruthy()
    expect(screen.getByRole('button', { name: "I'm ready" })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Spectate' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sit here' })).toBeNull()
  })

  it('lets a player who is not the host spectate between rounds', () => {
    const { dispatch } = renderGameSettings({
      userId: 'peer',
      status: GameStatus.RoundFinished,
      players: [createPlayer('host', { isHost: true }), createPlayer('peer')],
    })

    fireEvent.click(screen.getByRole('button', { name: 'Spectate' }))

    expect(dispatch).toHaveBeenCalledWith(becomeSpectatorEmitAction({ gameId: 'game' }))
  })

  it.each([
    ['the host between rounds', 'host', GameStatus.New, PlayerStatus.DontReadyToPlay],
    ['a player during a round', 'peer', GameStatus.Pause, PlayerStatus.InGame],
    ['a disconnected player between rounds', 'peer', GameStatus.RoundFinished, PlayerStatus.Disconnected],
  ])('offers %s no way to spectate', (_label, userId, status, peerStatus) => {
    renderGameSettings({ userId, status, players: [createPlayer('host', { isHost: true }), createPlayer('peer', { status: peerStatus })] })

    expect(screen.queryByRole('button', { name: 'Spectate' })).toBeNull()
  })
})
