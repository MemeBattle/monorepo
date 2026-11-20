// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import { becomePlayerEmitAction, PlayerStatus } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState } from '#ducks/game'
import { createMockStore } from '#testing/lib/createMockStore'
import { FreeSeat } from './FreeSeat'

const renderFreeSeat = (viewer: 'spectator' | 'player') => {
  const store = createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId: 'viewer', isBootstrapped: true },
      game: {
        ...initialState,
        game: {
          ...initialState.game,
          id: 'room-1',
          players:
            viewer === 'player'
              ? {
                  viewer: {
                    id: 'viewer',
                    isHost: true,
                    status: PlayerStatus.DontReadyToPlay,
                    cards: [],
                    ligrettoDeck: { isHidden: true, cards: [] },
                    stackOpenDeck: { isHidden: false, cards: [] },
                    stackDeck: { isHidden: true, cards: [] },
                  },
                }
              : {},
          spectators: viewer === 'spectator' ? { viewer: { id: 'viewer' } } : {},
        },
      },
    },
  })
  const dispatch = vi.spyOn(store, 'dispatch')

  render(
    <Provider store={store}>
      <FreeSeat offersSeat />
    </Provider>,
  )

  return { dispatch }
}

const emulateNarrowScreen = () => {
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: true,
    media,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

describe('FreeSeat', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets a spectator take the seat, and still invite friends', () => {
    const { dispatch } = renderFreeSeat('spectator')

    expect(screen.getByRole('button', { name: 'Invite friends to join you!' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sit here' }))

    expect(dispatch).toHaveBeenCalledWith(becomePlayerEmitAction({ gameId: 'room-1' }))
  })

  it('keeps the names of the icon-only invite and Sit here on a narrow screen', () => {
    emulateNarrowScreen()
    const { dispatch } = renderFreeSeat('spectator')

    expect(screen.getByRole('button', { name: 'Invite friends to join you!' })).toBeTruthy()
    expect(screen.queryByText('Invite friends to join you!')).toBeNull()
    expect(screen.queryByText('Sit here')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sit here' }))

    expect(dispatch).toHaveBeenCalledWith(becomePlayerEmitAction({ gameId: 'room-1' }))
  })

  it('offers a seated player only the invite', () => {
    renderFreeSeat('player')

    expect(screen.getByText('Free seat')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Invite friends to join you!' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sit here' })).toBeNull()
  })
})
