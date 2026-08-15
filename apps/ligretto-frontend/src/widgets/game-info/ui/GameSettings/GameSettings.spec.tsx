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

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    expect(dispatch).toHaveBeenCalledWith(resumeGameAction())
  })
})
