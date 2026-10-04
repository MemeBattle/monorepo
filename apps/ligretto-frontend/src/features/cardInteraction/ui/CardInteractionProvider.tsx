import { useCallback, useEffect, useMemo, useReducer, type PropsWithChildren } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDndContext,
  useDndMonitor,
  useSensor,
  useSensors,
  type ClientRect,
  type CollisionDetection,
  type UniqueIdentifier,
} from '@dnd-kit/core'

import { Hotkey } from '#ducks/game'
import type { CardDragData, CardDropData, CardInteractionTarget } from '../model/types'
import { CardInteractionContext, isSameCardInteractionTarget } from './CardInteractionContext'
import { CardDragOverlay } from './CardDragOverlay'

interface CardInteractionProviderProps extends PropsWithChildren {
  enabled: boolean
}
type State =
  | { mode: 'idle' }
  | { mode: 'focused'; target: CardInteractionTarget }
  | { mode: 'dragging'; target: CardInteractionTarget; sourceId: UniqueIdentifier }
type Action =
  | { type: 'toggle'; target: CardInteractionTarget }
  | { type: 'clear'; target?: CardInteractionTarget }
  | { type: 'dragStart'; target: CardInteractionTarget; sourceId: UniqueIdentifier }
  | { type: 'dragTerminal'; sourceId: UniqueIdentifier }

/** Slack around a destination, in px, so a drop need not land inside its border. */
const DROP_SLACK = 12

const withSlack = (rect: ClientRect): ClientRect => ({
  top: rect.top - DROP_SLACK,
  left: rect.left - DROP_SLACK,
  bottom: rect.bottom + DROP_SLACK,
  right: rect.right + DROP_SLACK,
  width: rect.width + DROP_SLACK * 2,
  height: rect.height + DROP_SLACK * 2,
})

/**
 * Grows every destination by the same slack before testing the pointer against it, instead of
 * padding the elements: the places keep their exact size, spacing and refs. Neighbours that end up
 * overlapping are no problem — `pointerWithin` returns them all and sorts by distance, so the
 * nearest one still wins.
 */
const forgivingPointerWithin: CollisionDetection = args => {
  const droppableRects = new Map(args.droppableRects)
  droppableRects.forEach((rect, id) => droppableRects.set(id, withSlack(rect)))

  return pointerWithin({ ...args, droppableRects })
}

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'toggle':
      return state.mode === 'focused' && isSameCardInteractionTarget(state.target, action.target)
        ? { mode: 'idle' }
        : { mode: 'focused', target: action.target }
    case 'clear':
      return !action.target || (state.mode !== 'idle' && isSameCardInteractionTarget(state.target, action.target)) ? { mode: 'idle' } : state
    case 'dragStart':
      return { mode: 'dragging', target: action.target, sourceId: action.sourceId }
    case 'dragTerminal':
      return state.mode === 'dragging' && state.sourceId === action.sourceId ? { mode: 'idle' } : state
  }
}

const DndLifecycle = ({ enabled, dispatch }: { enabled: boolean; dispatch: React.Dispatch<Action> }) => {
  const { draggableNodes, droppableContainers } = useDndContext()
  useDndMonitor({
    onDragStart({ active }) {
      const target = active.data.current?.target as CardInteractionTarget | undefined
      if (enabled && target) {
        dispatch({ type: 'dragStart', target, sourceId: active.id })
      }
    },
    onDragEnd({ active, over }) {
      const source = draggableNodes.get(active.id)
      const dragged = source?.data.current as CardDragData | undefined
      const destination = over ? (droppableContainers.get(over.id)?.data.current as CardDropData | undefined) : undefined
      if (
        enabled &&
        dragged?.target &&
        destination?.onDrop &&
        source?.node.current?.isConnected &&
        over &&
        droppableContainers.get(over.id)?.node.current?.isConnected
      ) {
        destination.onDrop({ target: dragged.target, card: dragged.card })
      }
      dispatch({ type: 'dragTerminal', sourceId: active.id })
    },
    onDragCancel({ active }) {
      dispatch({ type: 'dragTerminal', sourceId: active.id })
    },
  })
  return null
}

export const CardInteractionProvider = ({ children, enabled }: CardInteractionProviderProps) => {
  const [state, dispatch] = useReducer(reducer, { mode: 'idle' })
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 8 } }),
  )
  const activeTarget = state.mode === 'idle' ? undefined : state.target

  const clearActiveTarget = useCallback((target?: CardInteractionTarget) => {
    dispatch({ type: 'clear', target })
  }, [])

  const toggleActiveTarget = useCallback(
    (target: CardInteractionTarget) => {
      if (enabled) {
        dispatch({ type: 'toggle', target })
      }
    },
    [enabled],
  )

  useEffect(() => {
    if (!enabled) {
      dispatch({ type: 'clear' })
    }
  }, [enabled])

  useEffect(() => {
    if (state.mode !== 'focused') {
      return
    }
    const listener = (event: globalThis.MouseEvent) => {
      if (!(event.target instanceof Element && event.target.closest('[data-card-interaction-element]'))) {
        dispatch({ type: 'clear' })
      }
    }
    document.addEventListener('click', listener)
    return () => document.removeEventListener('click', listener)
  }, [state.mode])

  useHotkeys(
    Hotkey.escape,
    event => {
      event.preventDefault()
      dispatch({ type: 'clear' })
    },
    { enabled: enabled && state.mode === 'focused' },
  )

  const value = useMemo(
    () => ({ activeTarget, clearActiveTarget, toggleActiveTarget, enabled }),
    [activeTarget, clearActiveTarget, toggleActiveTarget, enabled],
  )
  return (
    <CardInteractionContext value={value}>
      <DndContext sensors={sensors} collisionDetection={forgivingPointerWithin}>
        <DndLifecycle enabled={enabled} dispatch={dispatch} />
        <CardDragOverlay />
        {children}
      </DndContext>
    </CardInteractionContext>
  )
}
