// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardColors, type CardsDeck } from '@memebattle/ligretto-shared'

import type { CardDragData, CardPlacementTarget } from '../model/types'
import { CardPlacementProvider } from './CardPlacementProvider'
import { useDraggableCard } from './useDraggableCard'
import { useDroppableCard } from './useDroppableCard'

const onDrop = vi.fn<(dragged: CardDragData) => void>()

const DragHarness = ({
  valid = true,
  value = 2,
  target = { type: 'row', index: 1 },
}: {
  valid?: boolean
  value?: number
  target?: CardPlacementTarget
}) => {
  const card = { color: CardColors.red, value }
  const deck: CardsDeck | null = value === 1 ? null : { cards: [{ color: valid ? CardColors.red : CardColors.blue, value: 1 }], isHidden: false }
  const draggable = useDraggableCard(target, card)
  const droppable = useDroppableCard('playground.3', deck, onDrop)

  return (
    <>
      <button {...draggable}>source</button>
      <div {...droppable}>deck</div>
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

const drag = async () => {
  const source = screen.getByText('source')
  const destination = screen.getByText('deck')
  source.getBoundingClientRect = () => rect(0)
  destination.getBoundingClientRect = () => rect(100)
  fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0, buttons: 1 })
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10, buttons: 1 })
  await Promise.resolve()
  fireEvent.mouseMove(document, { clientX: 110, clientY: 10, buttons: 1 })
  fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
}

describe('card placement hooks', () => {
  beforeEach(() => onDrop.mockClear())
  afterEach(cleanup)

  it('calls the droppable callback with row-card data for a valid drop', async () => {
    render(
      <CardPlacementProvider enabled>
        <DragHarness />
      </CardPlacementProvider>,
    )

    await drag()

    await waitFor(() => expect(onDrop).toHaveBeenCalledOnce())
    expect(onDrop).toHaveBeenCalledWith({ target: { type: 'row', index: 1 }, card: { color: CardColors.red, value: 2 } })
  })

  it('does not call the droppable callback for an invalid drop', async () => {
    render(
      <CardPlacementProvider enabled>
        <DragHarness valid={false} />
      </CardPlacementProvider>,
    )

    await drag()

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('supports an explicit value-1 drop on an empty deck', async () => {
    render(
      <CardPlacementProvider enabled>
        <DragHarness value={1} target={{ type: 'open-stack' }} />
      </CardPlacementProvider>,
    )

    await drag()

    await waitFor(() => expect(onDrop).toHaveBeenCalledOnce())
    expect(onDrop).toHaveBeenCalledWith({ target: { type: 'open-stack' }, card: { color: CardColors.red, value: 1 } })
  })

  it('registers drag and drop attributes on the elements that call the hooks', () => {
    render(
      <CardPlacementProvider enabled>
        <DragHarness />
      </CardPlacementProvider>,
    )

    expect(screen.getByText('source').getAttribute('data-card-drag-id')).toBe('row.1.red.2')
    expect(screen.getByText('deck').getAttribute('data-card-drop-target')).toBe('playground.3')
  })
})
