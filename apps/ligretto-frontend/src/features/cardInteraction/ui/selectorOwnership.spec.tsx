// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import { CardColors, PlayerStatus } from '@memebattle/ligretto-shared'

import { createMockStore } from '#testing/lib/createMockStore'
import { authInitialState } from '#ducks/auth/authSlice'
import { initialState, updateGameAction } from '#ducks/game/slice'
import { CardInteractionProvider, useCardInteraction, useDroppableTarget } from '../index'

afterEach(cleanup)

const Destination = () => {
  const { isValid } = useDroppableTarget({ type: 'playground', index: 0 }, vi.fn())
  return <output data-testid="valid">{String(isValid)}</output>
}

const Owner = () => {
  const { isActive, toggleActiveTarget } = useCardInteraction({ type: 'row', index: 0 })
  return (
    <button data-card-interaction-element onClick={toggleActiveTarget}>
      {isActive ? 'selected' : 'idle'}
    </button>
  )
}

it('clears only when the selected Redux card changes without caller dependencies', () => {
  const card = { color: CardColors.red, value: 2 }
  const game = {
    ...initialState.game,
    playground: { decks: [{ cards: [{ color: CardColors.red, value: 1 }], isHidden: false }], droppedDecks: [] },
    players: {
      player: {
        id: 'player',
        isHost: true,
        status: PlayerStatus.InGame,
        cards: [card],
        ligrettoDeck: { cards: [], isHidden: true },
        stackDeck: { cards: [], isHidden: true },
        stackOpenDeck: { cards: [], isHidden: false },
      },
    },
  }
  const store = createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId: 'player' },
      game: { ...initialState, game },
    },
  })
  render(
    <Provider store={store}>
      <CardInteractionProvider enabled>
        <Owner />
        <Destination />
      </CardInteractionProvider>
    </Provider>,
  )
  fireEvent.click(screen.getByText('idle'))
  expect(screen.getByTestId('valid').textContent).toBe('true')
  act(() => {
    store.dispatch(updateGameAction({ ...game, name: 'unrelated update' }))
  })
  expect(screen.getByText('selected')).toBeTruthy()
  act(() => {
    store.dispatch(
      updateGameAction({
        ...game,
        playground: { decks: [{ cards: [{ color: CardColors.blue, value: 1 }], isHidden: false }], droppedDecks: [] },
      }),
    )
  })
  expect(screen.getByTestId('valid').textContent).toBe('false')
  act(() => {
    store.dispatch(updateGameAction(game))
  })
  expect(screen.getByTestId('valid').textContent).toBe('true')
  act(() => {
    store.dispatch(
      updateGameAction({
        ...game,
        players: { player: { ...game.players.player, cards: [{ ...card, value: 3 }] } },
      }),
    )
  })
  expect(screen.getByText('idle')).toBeTruthy()
})

it('derives drop validity from the selected source and current Redux destination', () => {
  const store = createMockStore()
  const view = render(
    <Provider store={store}>
      <CardInteractionProvider enabled>
        <Destination />
      </CardInteractionProvider>
    </Provider>,
  )
  expect(view.getByTestId('valid').textContent).toBe('false')
})
