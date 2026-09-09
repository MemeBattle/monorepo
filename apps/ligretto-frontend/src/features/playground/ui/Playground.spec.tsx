// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import { CardColors, PlayerStatus, putCardAction, putCardFromStackOpenDeck } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState as gameInitialState, updateGameAction } from '#ducks/game/slice'
import { heightByCardSize, widthByCardSize } from '#entities/card/ui/Card'
import { CardInteractionProvider, useCardInteraction } from '#features/cardInteraction'
import { createMockStore } from '#testing/lib/createMockStore'
import { Playground } from './Playground'
import { PlayerRowCardsContainer } from '#features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer'
import { PlayerCardsStack } from '#features/player/ui/PlayerCardsStack/PlayerCardsStack'
import { PlayerCardDragOverlay } from '#features/player/ui/PlayerCardDragOverlay'

afterEach(async () => {
  cleanup()
  // MouseSensor keeps its document click suppressor for 50ms after release.
  await new Promise(resolve => setTimeout(resolve, 60))
})

const createTestStore = () =>
  createMockStore({
    preloadedState: {
      auth: { ...authInitialState, userId: 'player' },
      game: {
        ...gameInitialState,
        game: {
          ...gameInitialState.game,
          id: 'game',
          playground: { decks: [{ cards: [{ color: CardColors.red, value: 1 }], isHidden: false }], droppedDecks: [] },
          players: {
            player: {
              id: 'player',
              isHost: true,
              status: PlayerStatus.InGame,
              cards: [{ color: CardColors.red, value: 2 }],
              ligrettoDeck: { cards: [], isHidden: true },
              stackDeck: { cards: [], isHidden: true },
              stackOpenDeck: { cards: [], isHidden: false },
            },
          },
        },
      },
    },
  })

const startDrag = async (container: HTMLElement) => {
  const source = container.querySelector<HTMLElement>('[data-card-drag-source]')!
  const destination = container.querySelector<HTMLElement>('[data-card-drop-target="playground.0"]')!
  const rect = (left: number) => ({ x: left, y: 0, left, top: 0, right: left + 50, bottom: 50, width: 50, height: 50, toJSON() {} })
  source.getBoundingClientRect = () => rect(0)
  destination.getBoundingClientRect = () => rect(100)
  fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0, buttons: 1 })
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10, buttons: 1 })
  await Promise.resolve()
  fireEvent.mouseMove(document, { clientX: 110, clientY: 10, buttons: 1 })
  return { source, destination }
}

const RowCard = () => {
  const { toggleActiveTarget } = useCardInteraction({ type: 'row', index: 0 })
  return <button onClick={toggleActiveTarget}>select row card</button>
}

const TestProvider = ({ children }: React.PropsWithChildren) => {
  const store = createTestStore()
  return (
    <Provider store={store}>
      <CardInteractionProvider enabled>{children}</CardInteractionProvider>
    </Provider>
  )
}

describe('Playground', () => {
  it('lets a real row drag own placement and renders the player-owned overlay', async () => {
    const store = createTestStore()
    const dispatch = vi.spyOn(store, 'dispatch')
    const view = render(
      <Provider store={store}>
        <CardInteractionProvider enabled>
          <PlayerCardDragOverlay />
          <PlayerRowCardsContainer />
          <Playground />
        </CardInteractionProvider>
      </Provider>,
    )
    const { source, destination } = await startDrag(view.container)
    expect(source.style.opacity).toBe('0')
    expect(view.container.querySelector('[data-card-drag-overlay]')?.textContent).toContain('2')
    fireEvent.click(destination)
    expect(dispatch).not.toHaveBeenCalled()
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(putCardAction({ cardIndex: 0, gameId: 'game', playgroundDeckIndex: 0 }))
    expect(source.style.opacity).toBe('1')
    await waitFor(() => expect(view.container.querySelector('[data-card-drag-overlay]')).toBeNull())
  })

  it('renders the droppable surface inside each CardPlace', () => {
    const view = render(
      <TestProvider>
        <Playground />
      </TestProvider>,
    )

    const cardPlace = view.container.querySelector('[data-test-id="Playground-Deck-0"]')
    const dropTarget = view.container.querySelector('[data-card-drop-target="playground.0"]')
    expect(cardPlace?.contains(dropTarget)).toBe(true)
    expect(getComputedStyle(dropTarget!).width).toBe(widthByCardSize.large)
    expect(getComputedStyle(dropTarget!).height).toBe(heightByCardSize.large)
  })

  it('does not dispatch placement without a selected card', () => {
    const store = createTestStore()
    const dispatch = vi.spyOn(store, 'dispatch')
    const view = render(
      <Provider store={store}>
        <CardInteractionProvider enabled>
          <Playground />
        </CardInteractionProvider>
      </Provider>,
    )

    fireEvent.click(view.container.querySelector('[data-card-drop-target="playground.0"]')!)

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: putCardAction.type }))
  })

  it('rejects an invalid pile click without dispatching a placement', () => {
    const store = createTestStore()
    const game = store.getState().game.game
    store.dispatch(
      updateGameAction({
        ...game,
        playground: { decks: [{ cards: [{ color: CardColors.blue, value: 1 }], isHidden: false }], droppedDecks: [] },
      }),
    )
    const dispatch = vi.spyOn(store, 'dispatch')
    const view = render(
      <Provider store={store}>
        <CardInteractionProvider enabled>
          <PlayerRowCardsContainer />
          <Playground />
        </CardInteractionProvider>
      </Provider>,
    )
    fireEvent.click(view.container.querySelector('[data-card-drag-source]')!)
    const destination = view.container.querySelector('[data-card-drop-target="playground.0"]')!
    expect(destination.hasAttribute('data-drop-valid')).toBe(false)
    fireEvent.click(destination)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispatches row-card placement from the playground deck', () => {
    const store = createTestStore()
    const dispatch = vi.spyOn(store, 'dispatch')
    const view = render(
      <Provider store={store}>
        <CardInteractionProvider enabled>
          <RowCard />
          <Playground />
        </CardInteractionProvider>
      </Provider>,
    )

    fireEvent.click(view.getByText('select row card'))
    fireEvent.click(view.container.querySelector('[data-card-drop-target="playground.0"]')!)

    expect(dispatch).toHaveBeenCalledWith(putCardAction({ cardIndex: 0, gameId: 'game', playgroundDeckIndex: 0 }))
  })
})

it.each(['source', 'destination'] as const)('rejects a rendered row drop after the %s changes in Redux', async change => {
  const store = createTestStore()
  const dispatch = vi.spyOn(store, 'dispatch')
  const view = render(
    <Provider store={store}>
      <CardInteractionProvider enabled>
        <PlayerRowCardsContainer />
        <Playground />
      </CardInteractionProvider>
    </Provider>,
  )
  await startDrag(view.container)
  const game = store.getState().game.game
  act(() => {
    store.dispatch(
      updateGameAction(
        change === 'source'
          ? {
              ...game,
              players: { player: { ...game.players.player!, cards: [{ color: CardColors.red, value: 3 }] } },
            }
          : {
              ...game,
              playground: { decks: [{ cards: [{ color: CardColors.blue, value: 1 }], isHidden: false }], droppedDecks: [] },
            },
      ),
    )
  })
  dispatch.mockClear()
  fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
  expect(dispatch).not.toHaveBeenCalled()
})

it('dispatches the open-stack placement exactly once through a real rendered drag', async () => {
  const store = createTestStore()
  const game = store.getState().game.game
  store.dispatch(
    updateGameAction({
      ...game,
      players: {
        player: {
          ...game.players.player!,
          stackOpenDeck: { cards: [{ color: CardColors.red, value: 2 }], isHidden: false },
        },
      },
    }),
  )
  const dispatch = vi.spyOn(store, 'dispatch')
  const view = render(
    <Provider store={store}>
      <CardInteractionProvider enabled>
        <PlayerCardsStack />
        <Playground />
      </CardInteractionProvider>
    </Provider>,
  )
  await startDrag(view.container)
  fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
  expect(dispatch).toHaveBeenCalledExactlyOnceWith(putCardFromStackOpenDeck({ gameId: 'game', playgroundDeckIndex: 0 }))
})
