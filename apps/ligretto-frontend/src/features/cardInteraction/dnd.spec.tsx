// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardColors, type CardsDeck } from '@memebattle/ligretto-shared'

import type { CardDragData, CardInteractionTarget } from './model/types'
import { CardInteractionProvider } from './ui/CardInteractionProvider'
import { useCardInteraction } from './ui/useCardInteraction'
import { useDraggableCard } from './ui/useDraggableCard'
import { useDroppableCard } from './ui/useDroppableCard'

const onDrop = vi.fn<(dragged: CardDragData) => void>()

const ActiveTarget = () => {
  const { activeTarget } = useCardInteraction()
  return <output>{activeTarget?.type === 'row' ? `row.${activeTarget.index}` : (activeTarget?.type ?? 'none')}</output>
}

const DragHarness = ({
  valid = true,
  value = 2,
  target = { type: 'row', index: 1 },
}: {
  valid?: boolean
  value?: number
  target?: CardInteractionTarget
}) => {
  const card = { color: CardColors.red, value }
  const deck: CardsDeck | null = value === 1 ? null : { cards: [{ color: valid ? CardColors.red : CardColors.blue, value: 1 }], isHidden: false }
  const { id, isDragging, listeners, setNodeRef: setDraggableRef } = useDraggableCard(target, card)
  const { isOver, isValid, setNodeRef: setDroppableRef } = useDroppableCard('playground.3', deck, onDrop)

  return (
    <>
      <button
        {...listeners}
        ref={setDraggableRef}
        data-card-drag-source
        data-card-drag-id={id}
        style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'none' }}
      >
        source
      </button>
      <div ref={setDroppableRef} data-card-drop-target="playground.3" data-drop-valid={isValid || undefined} data-drop-over={isOver || undefined}>
        deck
      </div>
      <ActiveTarget />
    </>
  )
}

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

const drag = async (release = true) => {
  const source = screen.getByText('source')
  const destination = screen.getByText('deck')
  source.getBoundingClientRect = () => rect(0)
  destination.getBoundingClientRect = () => rect(100)
  fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0, buttons: 1 })
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10, buttons: 1 })
  await Promise.resolve()
  fireEvent.mouseMove(document, { clientX: 110, clientY: 10, buttons: 1 })
  if (release) {
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
  }
}

describe('card placement hooks', () => {
  beforeEach(() => onDrop.mockClear())
  afterEach(cleanup)

  it('calls the droppable callback with row-card data for a valid drop', async () => {
    render(
      <CardInteractionProvider enabled>
        <DragHarness />
      </CardInteractionProvider>,
    )

    await drag()

    await waitFor(() => expect(onDrop).toHaveBeenCalledOnce())
    expect(onDrop).toHaveBeenCalledWith({ target: { type: 'row', index: 1 }, card: { color: CardColors.red, value: 2 } })
  })

  it('uses activeTarget for the card currently being dragged', async () => {
    render(
      <CardInteractionProvider enabled>
        <DragHarness />
      </CardInteractionProvider>,
    )

    await drag(false)
    expect(screen.getByText('row.1')).toBeTruthy()
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('does not complete a drag after interactions become disabled', async () => {
    const tree = (enabled: boolean) => (
      <CardInteractionProvider enabled={enabled}>
        <DragHarness />
      </CardInteractionProvider>
    )
    const view = render(tree(true))

    await drag(false)
    view.rerender(tree(false))
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })

    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('does not call the droppable callback for an invalid drop', async () => {
    render(
      <CardInteractionProvider enabled>
        <DragHarness valid={false} />
      </CardInteractionProvider>,
    )

    await drag()

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('supports an explicit value-1 drop on an empty deck', async () => {
    render(
      <CardInteractionProvider enabled>
        <DragHarness value={1} target={{ type: 'open-stack' }} />
      </CardInteractionProvider>,
    )

    await drag()

    await waitFor(() => expect(onDrop).toHaveBeenCalledOnce())
    expect(onDrop).toHaveBeenCalledWith({ target: { type: 'open-stack' }, card: { color: CardColors.red, value: 1 } })
  })

  it('registers drag and drop attributes on the elements that call the hooks', () => {
    render(
      <CardInteractionProvider enabled>
        <DragHarness />
      </CardInteractionProvider>,
    )

    expect(screen.getByText('source').getAttribute('data-card-drag-id')).toBe('row.1.red.2')
    expect(screen.getByText('deck').getAttribute('data-card-drop-target')).toBe('playground.3')
  })
})
