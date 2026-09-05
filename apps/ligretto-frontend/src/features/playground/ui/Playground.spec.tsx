// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import { CardColors, PlayerStatus, putCardAction } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState as gameInitialState } from '#ducks/game/slice'
import { heightByCardSize, widthByCardSize } from '#entities/card/ui/Card'
import { CardInteractionProvider, useCardInteraction } from '#features/cardInteraction'
import { createMockStore } from '#testing/lib/createMockStore'
import { Playground } from './Playground'
import { PlayerRowCardsContainer } from '#features/player/ui/PlayerRowCardsContainer/PlayerRowCardsContainer'
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

const RowCard = () => {
  const { toggleActiveTarget } = useCardInteraction({ type: 'row', index: 0 }, [])
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
          <Playground cardsDecks={[{ cards: [{ color: CardColors.red, value: 1 }], isHidden: false }]} />
        </CardInteractionProvider>
      </Provider>,
    )
    const source = view.container.querySelector<HTMLElement>('[data-card-drag-source]')!
    const destination = view.container.querySelector<HTMLElement>('[data-card-drop-target="playground.0"]')!
    const rect = (left: number) => ({ x: left, y: 0, left, top: 0, right: left + 50, bottom: 50, width: 50, height: 50, toJSON() {} })
    source.getBoundingClientRect = () => rect(0)
    destination.getBoundingClientRect = () => rect(100)
    fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0, buttons: 1 })
    fireEvent.mouseMove(document, { clientX: 20, clientY: 10, buttons: 1 })
    await Promise.resolve()
    fireEvent.mouseMove(document, { clientX: 110, clientY: 10, buttons: 1 })
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
        <Playground cardsDecks={[{ cards: [{ color: CardColors.red, value: 1 }], isHidden: false }]} />
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
          <Playground cardsDecks={[null]} />
        </CardInteractionProvider>
      </Provider>,
    )

    fireEvent.click(view.container.querySelector('[data-card-drop-target="playground.0"]')!)

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: putCardAction.type }))
  })

  it('dispatches row-card placement from the playground deck', () => {
    const store = createTestStore()
    const dispatch = vi.spyOn(store, 'dispatch')
    const view = render(
      <Provider store={store}>
        <CardInteractionProvider enabled>
          <RowCard />
          <Playground cardsDecks={[null]} />
        </CardInteractionProvider>
      </Provider>,
    )

    fireEvent.click(view.getByText('select row card'))
    fireEvent.click(view.container.querySelector('[data-card-drop-target="playground.0"]')!)

    expect(dispatch).toHaveBeenCalledWith(putCardAction({ cardIndex: 0, gameId: 'game', playgroundDeckIndex: 0 }))
  })
})
