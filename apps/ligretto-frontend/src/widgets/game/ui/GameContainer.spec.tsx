// @vitest-environment jsdom

import { CardColors, GameStatus, PlayerStatus, type Player } from '@memebattle/ligretto-shared'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { initialState, tapLigrettoDeckCardAction, tapStackDeckCardAction, updateGameAction } from '#ducks/game'
import { createMockStore } from '#testing/lib/createMockStore'
import { GameContainer } from './GameContainer'

afterEach(cleanup)

const renderGame = () => {
  const player: Player = {
    id: 'player',
    isHost: true,
    status: PlayerStatus.InGame,
    cards: [{ color: CardColors.red, value: 1 }, null],
    stackDeck: { isHidden: true, cards: [{ color: CardColors.red, value: 4 }] },
    stackOpenDeck: { isHidden: false, cards: [{ color: CardColors.blue, value: 1 }] },
    ligrettoDeck: { isHidden: true, cards: [{ color: CardColors.green, value: 3 }] },
  }
  const store = createMockStore({
    preloadedState: {
      auth: { userId: player.id, token: '', isLoading: false },
      users: { ids: [player.id], entities: { [player.id]: { casId: player.id, isTemporary: true } } },
      game: {
        ...initialState,
        game: {
          ...initialState.game,
          id: 'game',
          status: GameStatus.InGame,
          players: { [player.id]: player, peer: { ...player, id: 'peer', isHost: false } },
          playground: { decks: Array.from({ length: 12 }, () => null), droppedDecks: [] },
        },
      },
    },
  })
  const dispatch = vi.spyOn(store, 'dispatch')
  const view = render(
    <Provider store={store}>
      <GameContainer />
    </Provider>,
  )
  return { store, dispatch, player, ...view }
}

const press = (key: string, code: string) => fireEvent.keyDown(document.body, { key, code })

describe('GameContainer interaction gating', () => {
  it.each([GameStatus.Pause, GameStatus.RoundFinished])('disables mounted card hotkeys when the game becomes %s', status => {
    const { store, dispatch, container } = renderGame()
    press('l', 'KeyL')
    press(' ', 'Space')
    expect(dispatch.mock.calls.map(([action]) => action)).toEqual([tapLigrettoDeckCardAction(), tapStackDeckCardAction()])
    press('q', 'KeyQ')

    // Keep the player's cards mounted to verify the provider's game-status gate itself.
    act(() => store.dispatch(updateGameAction({ ...store.getState().game.game, status })))
    dispatch.mockClear()
    expect(screen.getByText('L')).toBeTruthy()
    fireEvent.click(container.querySelector('[data-test-id="Playground-Deck-0"]')!)
    press('l', 'KeyL')
    press(' ', 'Space')
    press('q', 'KeyQ')
    fireEvent.click(container.querySelector('[data-test-id="Playground-Deck-0"]')!)
    press('x', 'KeyX')
    fireEvent.click(container.querySelector('[data-test-id="Playground-Deck-0"]')!)
    expect(dispatch).not.toHaveBeenCalled()

    act(() => store.dispatch(updateGameAction({ ...store.getState().game.game, status: GameStatus.InGame })))
    dispatch.mockClear()
    fireEvent.click(container.querySelector('[data-test-id="Playground-Deck-0"]')!)
    expect(dispatch).not.toHaveBeenCalled()
    press('l', 'KeyL')
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(tapLigrettoDeckCardAction())
  })

  it('unmounts the hand and its hotkeys when the last Ligretto card ends the round', () => {
    const { store, dispatch, player } = renderGame()
    press('l', 'KeyL')
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(tapLigrettoDeckCardAction())

    const game = store.getState().game.game
    act(() =>
      store.dispatch(
        updateGameAction({
          ...game,
          status: GameStatus.RoundFinished,
          players: {
            ...game.players,
            [player.id]: {
              ...player,
              status: PlayerStatus.DontReadyToPlay,
              cards: [player.cards[0], ...player.ligrettoDeck.cards],
              ligrettoDeck: { ...player.ligrettoDeck, cards: [] },
            },
          },
        }),
      ),
    )
    dispatch.mockClear()
    expect(screen.queryByText('L')).toBeNull()
    expect(screen.queryByText('SPACE')).toBeNull()
    press('l', 'KeyL')
    press(' ', 'Space')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('removes the card hotkeys when the current user becomes a spectator without a player deck', () => {
    const { store, dispatch, player } = renderGame()
    press('l', 'KeyL')
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(tapLigrettoDeckCardAction())

    const game = store.getState().game.game
    act(() => store.dispatch(updateGameAction({ ...game, players: { peer: game.players.peer }, spectators: { [player.id]: { id: player.id } } })))
    dispatch.mockClear()
    expect(screen.queryByText('L')).toBeNull()
    press('l', 'KeyL')
    press(' ', 'Space')
    expect(dispatch).not.toHaveBeenCalled()
  })
})
