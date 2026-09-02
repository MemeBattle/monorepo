// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'
import { CardColors, PlayerStatus, putCardAction } from '@memebattle/ligretto-shared'

import { authInitialState } from '#ducks/auth/authSlice'
import { initialState as gameInitialState } from '#ducks/game/slice'
import { heightByCardSize, widthByCardSize } from '#entities/card/ui/Card'
import { CardInteractionProvider, useCardInteraction } from '#features/cardInteraction'
import { createMockStore } from '#testing/lib/createMockStore'
import { Playground } from './Playground'

afterEach(cleanup)

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
