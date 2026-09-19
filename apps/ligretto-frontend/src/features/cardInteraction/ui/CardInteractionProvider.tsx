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
  type UniqueIdentifier,
} from '@dnd-kit/core'

import { Hotkey } from '#ducks/game'
import type { CardDragData, CardDropData, CardInteractionTarget } from '../model/types'
import { CardInteractionContext, getInteractionTargetKey, isSameCardInteractionTarget } from './CardInteractionContext'
import { CardDragOverlay } from './CardDragOverlay'

interface CardInteractionProviderProps extends PropsWithChildren {
  enabled: boolean
}
type State =
  | { mode: 'idle' }
  | { mode: 'focused'; target: CardInteractionTarget }
  | { mode: 'dragging'; target: CardInteractionTarget; sourceId: UniqueIdentifier }
  | { mode: 'placing'; target: CardInteractionTarget }
type Action =
  | { type: 'toggle'; target: CardInteractionTarget }
  | { type: 'clear'; target?: CardInteractionTarget }
  | { type: 'dragStart'; target: CardInteractionTarget; sourceId: UniqueIdentifier }
  | { type: 'dragTerminal'; sourceId: UniqueIdentifier }
  | { type: 'place'; target: CardInteractionTarget }

/**
 * How long a placed card stays hidden when the server never confirms the move.
 * Long enough to cover a normal round trip, short enough not to lose a card.
 */
const PLACEMENT_TIMEOUT_MS = 2000

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
    case 'place':
      return { mode: 'placing', target: action.target }
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
      // A placement started by the drop keeps the source hidden; this only unwinds a drag that placed nothing.
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
  const activeTarget = state.mode === 'focused' || state.mode === 'dragging' ? state.target : undefined
  const placingTarget = state.mode === 'placing' ? state.target : undefined

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

  const startPlacing = useCallback((target: CardInteractionTarget) => {
    dispatch({ type: 'place', target })
  }, [])

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

  const placingKey = placingTarget && getInteractionTargetKey(placingTarget)
  useEffect(() => {
    if (!placingKey) {
      return
    }
    // The move normally ends when the placed card changes under its source and that source clears
    // its own target; this only covers a move the server never answers.
    const timer = setTimeout(() => dispatch({ type: 'clear' }), PLACEMENT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [placingKey])

  useHotkeys(
    Hotkey.escape,
    event => {
      event.preventDefault()
      dispatch({ type: 'clear' })
    },
    { enabled: enabled && state.mode === 'focused' },
  )

  const value = useMemo(
    () => ({ activeTarget, placingTarget, clearActiveTarget, toggleActiveTarget, startPlacing, enabled }),
    [activeTarget, placingTarget, clearActiveTarget, toggleActiveTarget, startPlacing, enabled],
  )
  return (
    <CardInteractionContext value={value}>
      <DndContext sensors={sensors} collisionDetection={pointerWithin}>
        <DndLifecycle enabled={enabled} dispatch={dispatch} />
        <CardDragOverlay />
        {children}
      </DndContext>
    </CardInteractionContext>
  )
}
