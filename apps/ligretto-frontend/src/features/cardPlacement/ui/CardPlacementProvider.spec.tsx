// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardColors, putCardAction, putCardFromStackOpenDeck } from '@memebattle/ligretto-shared'

import { Card } from '#entities/card'
import { CardFocusProvider, useCardFocus } from '#features/cardFocus'
import { CardPlacementProvider } from './CardPlacementProvider'
import { DraggableCard } from './DraggableCard'
import { PlaygroundDeckDropTarget } from './PlaygroundDeckDropTarget'
import { useCardPlacement } from './useCardPlacement'

const mocks = vi.hoisted(() => ({ dispatch: vi.fn() }))

vi.mock('react-redux', async importActual => ({
  ...(await importActual<typeof import('react-redux')>()),
  useDispatch: () => mocks.dispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}))

vi.mock('#ducks/game', async importActual => ({
  ...(await importActual<typeof import('#ducks/game')>()),
  gameIdSelector: () => 'game',
}))

const Harness = () => {
  const focus = useCardFocus({ type: 'row', index: 2 }, [CardColors.red, 3])
  const { placeCard } = useCardPlacement()
  const { focusedCard } = useCardFocus()

  return (
    <>
      <button onClick={focus.toggleFocus}>focus</button>
      <button data-card-focus-element onClick={() => placeCard({ type: 'row', index: 2 }, 5)}>
        place
      </button>
      <output>{focusedCard ? 'focused' : 'clear'}</output>
    </>
  )
}

const DragHarness = ({
  valid = true,
  value = 2,
  target = { type: 'row', index: 1 },
  showSource = true,
}: {
  valid?: boolean
  value?: number
  target?: { type: 'open-stack' } | { type: 'row'; index: number }
  showSource?: boolean
}) => (
  <>
    {showSource ? (
      <DraggableCard target={target} card={{ color: CardColors.red, value }}>
        <Card color={CardColors.red} value={value} />
      </DraggableCard>
    ) : null}
    <PlaygroundDeckDropTarget
      deckIndex={3}
      deck={value === 1 ? null : { cards: [{ color: valid ? CardColors.red : CardColors.blue, value: 1 }], isHidden: false }}
    >
      <div>deck</div>
    </PlaygroundDeckDropTarget>
  </>
)

const rect = (left: number, top = 0, width = 50, height = 50): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  }) as DOMRect

const drag = async (source: HTMLElement, destination: HTMLElement) => {
  source.getBoundingClientRect = () => rect(0)
  destination.getBoundingClientRect = () => rect(100)
  fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0, buttons: 1 })
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10, buttons: 1 })
  await Promise.resolve()
  fireEvent.mouseMove(document, { clientX: 110, clientY: 10, buttons: 1 })
  fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
}

const beginDrag = async (source: HTMLElement, destination: HTMLElement) => {
  source.getBoundingClientRect = () => rect(0)
  destination.getBoundingClientRect = () => rect(100)
  fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0, buttons: 1 })
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10, buttons: 1 })
  await Promise.resolve()
  fireEvent.mouseMove(document, { clientX: 110, clientY: 10, buttons: 1 })
}

describe('CardPlacementProvider', () => {
  beforeEach(() => mocks.dispatch.mockClear())
  afterEach(cleanup)

  it('routes click placement without clearing focus before the backend confirms it', () => {
    render(
      <CardFocusProvider enabled>
        <CardPlacementProvider enabled>
          <Harness />
        </CardPlacementProvider>
      </CardFocusProvider>,
    )

    fireEvent.click(screen.getByText('focus'))
    expect(screen.getByText('focused')).toBeTruthy()

    fireEvent.click(screen.getByText('place'))

    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(putCardAction({ gameId: 'game', cardIndex: 2, playgroundDeckIndex: 5 }))
    expect(screen.getByText('focused')).toBeTruthy()
  })

  it('dispatches exactly once when a card is dragged to a valid deck', async () => {
    const view = render(
      <CardFocusProvider enabled>
        <CardPlacementProvider enabled>
          <DragHarness />
        </CardPlacementProvider>
      </CardFocusProvider>,
    )

    await drag(screen.getByTestId('card-drag-source'), view.container.querySelector('[data-card-drop-target="3"]') as HTMLElement)

    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledOnce())
    expect(mocks.dispatch).toHaveBeenCalledWith(putCardAction({ gameId: 'game', cardIndex: 1, playgroundDeckIndex: 3 }))
  })

  it('does not dispatch when a card is dragged to an invalid deck', async () => {
    const view = render(
      <CardFocusProvider enabled>
        <CardPlacementProvider enabled>
          <DragHarness valid={false} />
        </CardPlacementProvider>
      </CardFocusProvider>,
    )

    await drag(screen.getByTestId('card-drag-source'), view.container.querySelector('[data-card-drop-target="3"]') as HTMLElement)

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('places a value-1 card on the explicitly chosen empty deck', async () => {
    const view = render(
      <CardFocusProvider enabled>
        <CardPlacementProvider enabled>
          <DragHarness value={1} />
        </CardPlacementProvider>
      </CardFocusProvider>,
    )

    await drag(screen.getByTestId('card-drag-source'), view.container.querySelector('[data-card-drop-target="3"]') as HTMLElement)

    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledOnce())
    expect(mocks.dispatch).toHaveBeenCalledWith(putCardAction({ gameId: 'game', cardIndex: 1, playgroundDeckIndex: 3 }))
  })

  it('dispatches an open-stack placement to the chosen deck', async () => {
    const view = render(
      <CardFocusProvider enabled>
        <CardPlacementProvider enabled>
          <DragHarness target={{ type: 'open-stack' }} />
        </CardPlacementProvider>
      </CardFocusProvider>,
    )

    await drag(screen.getByTestId('card-drag-source'), view.container.querySelector('[data-card-drop-target="3"]') as HTMLElement)

    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledOnce())
    expect(mocks.dispatch).toHaveBeenCalledWith(putCardFromStackOpenDeck({ gameId: 'game', playgroundDeckIndex: 3 }))
  })

  it('does not place a stale card after its source unmounts', async () => {
    const tree = (showSource: boolean) => (
      <CardFocusProvider enabled>
        <CardPlacementProvider enabled>
          <DragHarness showSource={showSource} />
        </CardPlacementProvider>
      </CardFocusProvider>
    )
    const view = render(tree(true))
    const destination = view.container.querySelector('[data-card-drop-target="3"]') as HTMLElement
    await beginDrag(screen.getByTestId('card-drag-source'), destination)

    view.rerender(tree(false))
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
})
