// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import type { GameResults, Player } from '@memebattle/ligretto-shared'
import { GameStatus, kickFromRoomEmitAction, PlayerStatus } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState, updateGameAction } from '#ducks/game'
import { createMockStore } from '#testing/lib/createMockStore'
import { PlayersScoresTableContainer } from '../PlayersScoresTableContainer'
import { PlayersTableItem } from './PlayersTableItem'

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

const createStore = ({ viewerId, status = GameStatus.New, results }: { viewerId: string; status?: GameStatus; results?: GameResults }) =>
  createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId: viewerId, isBootstrapped: true },
      game: {
        ...initialState,
        results,
        game: {
          ...initialState.game,
          id: 'room-1',
          status,
          players: {
            host: createPlayer('host', { isHost: true }),
            peer: createPlayer('peer', { status: PlayerStatus.ReadyToPlay }),
          },
        },
      },
    },
  })

const renderItem = (playerId: string, options: Parameters<typeof createStore>[0]) => {
  const store = createStore(options)
  const dispatch = vi.spyOn(store, 'dispatch')
  render(
    <Provider store={store}>
      <PlayersTableItem playerId={playerId} />
    </Provider>,
  )
  return { store, dispatch }
}

const removeButton = () => screen.queryByRole('button', { name: /^Remove .*from the room$/ })

describe('PlayersTableItem', () => {
  it('shows the player it is given, from the room and the last results', () => {
    renderItem('host', { viewerId: 'host', results: { host: { roundScore: -3, gameScore: 7 } } })

    expect(screen.getByText('Host')).toBeTruthy()
    expect(screen.getByText('You')).toBeTruthy()
    expect(screen.getByText('Not ready')).toBeTruthy()
    expect(screen.getByText('-3')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
  })

  it.each([GameStatus.New, GameStatus.RoundFinished])('lets the host remove that player in %s', status => {
    const { dispatch } = renderItem('peer', { viewerId: 'host', status })

    fireEvent.click(removeButton()!)

    expect(dispatch).toHaveBeenCalledWith(kickFromRoomEmitAction({ gameId: 'room-1', userId: 'peer' }))
  })

  it('offers the host no removal on their own row', () => {
    renderItem('host', { viewerId: 'host' })
    expect(removeButton()).toBeNull()
  })

  it.each([
    ['a player who is not the host', 'peer', 'host', GameStatus.New],
    ['the host during the countdown', 'host', 'peer', GameStatus.Starting],
    ['the host during a round', 'host', 'peer', GameStatus.InGame],
  ])('offers no removal to %s', (_label, viewerId, playerId, status) => {
    renderItem(playerId, { viewerId, status })
    expect(removeButton()).toBeNull()
  })

  it('shows nothing once the player is no longer in the room', () => {
    const { store } = renderItem('peer', { viewerId: 'host' })

    act(() => {
      store.dispatch(updateGameAction({ ...store.getState().game.game, players: { host: createPlayer('host', { isHost: true }) } }))
    })

    expect(screen.queryByText('Ready')).toBeNull()
  })
})

describe('PlayersScoresTableContainer', () => {
  it('lists the players with the leader first', () => {
    const store = createStore({ viewerId: 'host', results: { host: { roundScore: 1, gameScore: 1 }, peer: { roundScore: 4, gameScore: 9 } } })
    render(
      <Provider store={store}>
        <PlayersScoresTableContainer />
      </Provider>,
    )

    const totals = screen.getAllByText(/^\d+$/).map(element => element.textContent)
    expect(totals.slice(0, 2)).toEqual(['9', '1'])
  })
})
