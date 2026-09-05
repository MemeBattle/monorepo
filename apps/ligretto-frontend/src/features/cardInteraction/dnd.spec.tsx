// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canPlaceCardOnDeck, CardColors, type CardsDeck } from '@memebattle/ligretto-shared'

import type { CardDragData, CardDragTarget } from './model/types'
import { getInteractionTargetKey, useCardInteractionContext } from './ui/CardInteractionContext'
import { CardInteractionProvider } from './ui/CardInteractionProvider'
import { useCardInteraction } from './ui/useCardInteraction'
import { useDraggableCard } from './ui/useDraggableCard'
import { useDroppableTarget } from './ui/useDroppableTarget'
import { useCardHotkey } from './ui/useCardHotkey'
import { Hotkey } from '#ducks/game'

const onShortcut = vi.fn()
const onDrop = vi.fn<(dragged: CardDragData) => void>()
const TestProvider = ({ children, enabled = true }: React.PropsWithChildren<{ enabled?: boolean }>) => (
  <CardInteractionProvider enabled={enabled}>{children}</CardInteractionProvider>
)

const ActiveTarget = () => {
  const { activeTarget } = useCardInteraction()
  return <output>{activeTarget?.type === 'row' ? `row.${activeTarget.index}` : (activeTarget?.type ?? 'none')}</output>
}

const InteractionContextKeys = () => {
  const context = useCardInteractionContext()
  return <output data-testid="interaction-context-keys">{Object.keys(context).sort().join(',')}</output>
}

const DragSource = ({ value, target, disabled }: { value: number; target: CardDragTarget; disabled: boolean }) => {
  const card = { color: CardColors.red, value }
  const { toggleActiveTarget } = useCardInteraction(target, [value])
  useCardHotkey(Hotkey.q, () => {
    onShortcut()
    toggleActiveTarget()
  })
  const { id, isDragging, listeners, setNodeRef } = useDraggableCard(target, card, disabled)
  return (
    <button
      {...listeners}
      ref={setNodeRef}
      data-card-drag-source
      data-card-drag-id={id}
      data-card-interaction-element
      onClick={toggleActiveTarget}
      style={{ opacity: isDragging ? 0 : 1, touchAction: 'none' }}
    >
      source
    </button>
  )
}

const DragHarness = ({
  valid = true,
  value = 2,
  target = { type: 'row', index: 1 },
  disabled = false,
  showSource = true,
  showDestination = true,
  dropIndex = 3,
}: {
  valid?: boolean
  value?: number
  target?: CardDragTarget
  disabled?: boolean
  showSource?: boolean
  showDestination?: boolean
  dropIndex?: number
}) => {
  const deck: CardsDeck | null = value === 1 ? null : { cards: [{ color: valid ? CardColors.red : CardColors.blue, value: 1 }], isHidden: false }
  const {
    id: dropId,
    isOver,
    setNodeRef,
  } = useDroppableTarget({ type: 'playground', index: dropIndex }, dragged => {
    if (canPlaceCardOnDeck(dragged.card, deck)) {
      onDrop(dragged)
    }
  })
  return (
    <>
      {showSource && <DragSource value={value} target={target} disabled={disabled} />}
      {showDestination && (
        <div ref={setNodeRef} data-card-drop-target={dropId} data-drop-over={isOver || undefined}>
          deck
        </div>
      )}
      <ActiveTarget />
      <InteractionContextKeys />
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
  fireEvent.pointerDown(source, { pointerType: 'mouse', clientX: 10, clientY: 10, button: 0 })
  fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0, buttons: 1 })
  fireEvent.mouseMove(document, { clientX: 20, clientY: 10, buttons: 1 })
  await Promise.resolve()
  fireEvent.mouseMove(document, { clientX: 110, clientY: 10, buttons: 1 })
  if (release) {
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
  }
}

const touchDrag = async (release = true) => {
  const source = screen.getByText('source')
  const destination = screen.getByText('deck')
  source.getBoundingClientRect = () => rect(0)
  destination.getBoundingClientRect = () => rect(100)
  fireEvent.touchStart(source, { touches: [{ clientX: 10, clientY: 10, identifier: 1 }] })
  await vi.waitFor(() => expect(source.style.opacity).toBe('0'))
  fireEvent.touchMove(document, { touches: [{ clientX: 110, clientY: 10, identifier: 1 }] })
  if (release) {
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 110, clientY: 10, identifier: 1 }] })
  }
}

const pendingMouseDrag = () => {
  const source = screen.getByText('source')
  source.getBoundingClientRect = () => rect(0)
  fireEvent.pointerDown(source, { pointerType: 'mouse', clientX: 10, clientY: 10, button: 0 })
  fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0, buttons: 1 })
}

const pendingTouchDrag = () => {
  const source = screen.getByText('source')
  source.getBoundingClientRect = () => rect(0)
  fireEvent.touchStart(source, { touches: [{ clientX: 10, clientY: 10, identifier: 1 }] })
}

describe('card placement hooks', () => {
  beforeEach(() => {
    onDrop.mockClear()
    onShortcut.mockClear()
  })
  afterEach(cleanup)

  it.each(['disabled source', 'removed source', 'changed target', 'removed destination'] as const)('rejects a %s during a gesture', async change => {
    const view = render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )
    await drag(false)
    view.rerender(
      <TestProvider>
        <DragHarness
          disabled={change === 'disabled source'}
          showSource={change !== 'removed source'}
          target={{ type: 'row', index: change === 'changed target' ? 0 : 1 }}
          showDestination={change !== 'removed destination'}
        />
      </TestProvider>,
    )
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('cancels with Escape and permits a fresh drag afterwards', async () => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )
    await drag(false)
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.getByText('none')).toBeTruthy()
    expect(screen.getByText('source').style.opacity).toBe('1')
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    expect(onDrop).not.toHaveBeenCalled()
    await drag()
    expect(onDrop).toHaveBeenCalledOnce()
  })

  it('clears a drag released outside any destination', async () => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )
    await drag(false)
    fireEvent.mouseMove(document, { clientX: 300, clientY: 10, buttons: 1 })
    fireEvent.mouseUp(document, { clientX: 300, clientY: 10, button: 0 })
    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('uses one interaction key format for source and playground targets', () => {
    expect(getInteractionTargetKey({ type: 'open-stack' })).toBe('open-stack')
    expect(getInteractionTargetKey({ type: 'row', index: 1 })).toBe('row.1')
    expect(getInteractionTargetKey({ type: 'playground', index: 3 })).toBe('playground.3')
  })

  it('calls the droppable callback with row-card data for a valid drop', async () => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )

    await drag()

    await waitFor(() => expect(onDrop).toHaveBeenCalledOnce())
    expect(onDrop).toHaveBeenCalledWith({ target: { type: 'row', index: 1 }, card: { color: CardColors.red, value: 2 } })
  })

  it('uses activeTarget for the card currently being dragged', async () => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )

    await drag(false)
    expect(screen.getByText('row.1')).toBeTruthy()
    expect(screen.getByTestId('interaction-context-keys').textContent).not.toContain('activeCard')
    expect(screen.getByText('source').style.opacity).toBe('0')
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('does not complete a drag after interactions become disabled', async () => {
    const tree = (enabled: boolean) => (
      <TestProvider enabled={enabled}>
        <DragHarness />
      </TestProvider>
    )
    const view = render(tree(true))

    await drag(false)
    view.rerender(tree(false))
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })

    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('restores the source and cannot resume a drag across disable and re-enable', async () => {
    const tree = (enabled: boolean) => (
      <TestProvider enabled={enabled}>
        <DragHarness />
      </TestProvider>
    )
    const view = render(tree(true))
    await drag(false)
    view.rerender(tree(false))
    expect(screen.getByText('source').style.opacity).toBe('1')
    view.rerender(tree(true))
    fireEvent.keyDown(document.body, { key: 'q', code: 'KeyQ' })
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    expect(onShortcut).toHaveBeenCalledOnce()
    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.getByText('row.1')).toBeTruthy()
  })

  it('does not drop a replacement card after its source identity changes', async () => {
    const tree = (value: number) => (
      <TestProvider>
        <DragHarness value={value} />
      </TestProvider>
    )
    const view = render(tree(2))
    await drag(false)
    view.rerender(tree(1))
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.getByText('none')).toBeTruthy()
  })

  it.each([
    ['mouse', drag],
    ['touch', touchDrag],
  ] as const)('cancels a real %s drag before running a hotkey command', async (_sensor, startDrag) => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )
    await startDrag(false)
    fireEvent.keyDown(document.body, { key: 'q', code: 'KeyQ' })
    expect(onShortcut).toHaveBeenCalledOnce()
    expect(screen.getByText('row.1')).toBeTruthy()
    expect(screen.getByText('source').style.opacity).toBe('1')
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 110, clientY: 10, identifier: 1 }] })
    expect(onDrop).not.toHaveBeenCalled()
  })

  it.each([
    ['mouse distance', pendingMouseDrag],
    ['touch delay', pendingTouchDrag],
  ] as const)('cancels a pending %s sensor before it can activate', async (_sensor, startPendingDrag) => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )
    startPendingDrag()
    fireEvent.keyDown(document.body, { key: 'q', code: 'KeyQ' })
    fireEvent.mouseMove(document, { clientX: 110, clientY: 10, buttons: 1 })
    fireEvent.touchMove(document, { touches: [{ clientX: 110, clientY: 10, identifier: 1 }] })
    await new Promise(resolve => setTimeout(resolve, 180))
    expect(onShortcut).toHaveBeenCalledOnce()
    expect(screen.getByText('row.1')).toBeTruthy()
    expect(screen.getByText('source').style.opacity).toBe('1')
    expect(onDrop).not.toHaveBeenCalled()
  })

  it.each(['source', 'deck', 'outside'])('keeps newly focused target through a late abandoned release and ensuing %s click', async clicked => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )
    await drag(false)
    fireEvent.keyDown(document.body, { key: 'q', code: 'KeyQ' })
    expect(screen.getByText('row.1')).toBeTruthy()
    await new Promise(resolve => setTimeout(resolve, 60))
    fireEvent.mouseUp(document, { clientX: 110, clientY: 10, button: 0 })
    fireEvent.click(clicked === 'outside' ? document.body : screen.getByText(clicked))
    expect(screen.getByText('row.1')).toBeTruthy()
    expect(onDrop).not.toHaveBeenCalled()
    fireEvent.mouseDown(document.body)
    fireEvent.mouseUp(document.body)
    fireEvent.click(document.body)
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('ignores touch compatibility mouse events after a hotkey cancels the gesture', async () => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )
    pendingTouchDrag()
    fireEvent.keyDown(document.body, { key: 'q', code: 'KeyQ' })
    expect(screen.getByText('row.1')).toBeTruthy()
    await new Promise(resolve => setTimeout(resolve, 60))
    const source = screen.getByText('source')
    fireEvent.touchEnd(source)
    // Compatibility mouse events have no new physical pointerdown.
    fireEvent.mouseMove(source, { clientX: 10, clientY: 10 })
    fireEvent.mouseDown(source, { button: 0, buttons: 1 })
    fireEvent.mouseUp(source, { button: 0 })
    fireEvent.click(source)
    expect(screen.getByText('row.1')).toBeTruthy()
    expect(onDrop).not.toHaveBeenCalled()
    // A deliberate mouse gesture still clears focus normally.
    fireEvent.pointerDown(document.body, { pointerType: 'mouse' })
    fireEvent.mouseDown(document.body)
    fireEvent.mouseUp(document.body)
    fireEvent.click(document.body)
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('does not call the droppable callback for an invalid drop', async () => {
    render(
      <TestProvider>
        <DragHarness valid={false} />
      </TestProvider>,
    )

    await drag()

    expect(onDrop).not.toHaveBeenCalled()
  })

  it('supports an explicit value-1 drop on an empty deck', async () => {
    render(
      <TestProvider>
        <DragHarness value={1} target={{ type: 'open-stack' }} />
      </TestProvider>,
    )

    await drag()

    await waitFor(() => expect(onDrop).toHaveBeenCalledOnce())
    expect(onDrop).toHaveBeenCalledWith({ target: { type: 'open-stack' }, card: { color: CardColors.red, value: 1 } })
  })

  it('registers drag and drop attributes on the elements that call the hooks', () => {
    render(
      <TestProvider>
        <DragHarness />
      </TestProvider>,
    )

    expect(screen.getByText('source').getAttribute('data-card-drag-id')).toBe('row.1.red.2')
    expect(screen.getByText('deck').getAttribute('data-card-drop-target')).toBe('playground.3')
  })
})
