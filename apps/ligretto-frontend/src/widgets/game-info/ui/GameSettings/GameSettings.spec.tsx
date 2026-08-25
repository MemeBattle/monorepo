// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'

import { createMockStore } from '#testing/lib/createMockStore'
import { initialState, resumeGameAction } from '#ducks/game'
import { GameSettings } from './GameSettings'
import { GameSettingsContainer } from './GameSettingsContainer'

afterEach(cleanup)

describe('GameSettings', () => {
  it('labels the host action as Resume while the round is paused', () => {
    render(
      <Provider store={createMockStore()}>
        <GameSettings
          gameStatus={GameStatus.Pause}
          gameName="Paused game"
          canStartGame
          onStartClick={() => undefined}
          onReadyClick={() => undefined}
          onExitClick={() => undefined}
          isButtonDisabled={false}
          isPlayerReadyToPlay={false}
        />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
  })

  it.each([GameStatus.New, GameStatus.RoundFinished])('labels the host action as Start for %s games', gameStatus => {
    render(
      <Provider store={createMockStore()}>
        <GameSettings
          gameStatus={gameStatus}
          gameName="Game"
          canStartGame
          onStartClick={() => undefined}
          onReadyClick={() => undefined}
          onExitClick={() => undefined}
          isButtonDisabled={false}
          isPlayerReadyToPlay={false}
        />
      </Provider>,
    )

    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('dispatches the resume flow when the host resumes a paused round', () => {
    const player = {
      id: 'host',
      isHost: true,
      status: PlayerStatus.InGame,
      cards: [],
      ligrettoDeck: { isHidden: true, cards: [] },
      stackOpenDeck: { isHidden: false, cards: [] },
      stackDeck: { isHidden: true, cards: [] },
    }
    const store = createMockStore({
      preloadedState: {
        auth: { userId: player.id, token: '', isLoading: false },
        game: {
          ...initialState,
          game: {
            ...initialState.game,
            id: 'paused-game',
            status: GameStatus.Pause,
            players: {
              [player.id]: player,
              opponent: { ...player, id: 'opponent', isHost: false },
            },
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

    const resumeButton = screen.getByRole('button', { name: 'Resume' }) as HTMLButtonElement
    expect(resumeButton.disabled).toBe(false)
    fireEvent.click(resumeButton)

    expect(dispatch).toHaveBeenCalledWith(resumeGameAction())
  })

  it('disables host resume until two players are online', () => {
    const host = {
      id: 'host',
      isHost: true,
      status: PlayerStatus.InGame,
      cards: [],
      ligrettoDeck: { isHidden: true, cards: [] },
      stackOpenDeck: { isHidden: false, cards: [] },
      stackDeck: { isHidden: true, cards: [] },
    }
    const store = createMockStore({
      preloadedState: {
        auth: { userId: host.id, token: '', isLoading: false },
        game: {
          ...initialState,
          game: {
            ...initialState.game,
            status: GameStatus.Pause,
            players: { host, peer: { ...host, id: 'peer', isHost: false, status: PlayerStatus.Disconnected } },
          },
        },
      },
    })

    render(
      <Provider store={store}>
        <MemoryRouter>
          <GameSettingsContainer />
        </MemoryRouter>
      </Provider>,
    )

    expect((screen.getByRole('button', { name: 'Resume' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not render Resume for a non-host player while paused', () => {
    const player = {
      id: 'peer',
      isHost: false,
      status: PlayerStatus.InGame,
      cards: [],
      ligrettoDeck: { isHidden: true, cards: [] },
      stackOpenDeck: { isHidden: false, cards: [] },
      stackDeck: { isHidden: true, cards: [] },
    }
    const store = createMockStore({
      preloadedState: {
        auth: { userId: player.id, token: '', isLoading: false },
        game: {
          ...initialState,
          game: {
            ...initialState.game,
            status: GameStatus.Pause,
            players: { host: { ...player, id: 'host', isHost: true }, peer: player },
          },
        },
      },
    })

    render(
      <Provider store={store}>
        <MemoryRouter>
          <GameSettingsContainer />
        </MemoryRouter>
      </Provider>,
    )

    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Ready' })).toBeTruthy()
  })
})
