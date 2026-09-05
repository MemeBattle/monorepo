import { useCallback, useEffect, useMemo, useReducer, useRef, type PropsWithChildren } from 'react'
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

import type { CardDragData, CardDropData, CardInteractionTarget } from '../model/types'
import { CardInteractionContext, isSameCardInteractionTarget } from './CardInteractionContext'

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
      const destination = over?.data.current as CardDropData | undefined
      if (
        enabled &&
        dragged?.target &&
        !dragged.disabled &&
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
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )
  const activeTarget = state.mode === 'idle' ? undefined : state.target
  const clearActiveTarget = useCallback((target?: CardInteractionTarget) => {
    dispatch({ type: 'clear', target })
  }, [])
  const toggleActiveTarget = useCallback((target: CardInteractionTarget) => {
    if (enabledRef.current) {
      dispatch({ type: 'toggle', target })
    }
  }, [])
  const runCommand = useCallback((command: () => void) => {
    if (!enabledRef.current) {
      return
    }
    dispatch({ type: 'clear' })
    command()
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

  const value = useMemo(
    () => ({ activeTarget, clearActiveTarget, toggleActiveTarget, runCommand }),
    [activeTarget, clearActiveTarget, runCommand, toggleActiveTarget],
  )
  const captureInput = (event: React.SyntheticEvent) => {
    if (!enabled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  return (
    <CardInteractionContext value={value}>
      <div
        style={{ display: 'contents' }}
        onClickCapture={captureInput}
        onPointerDownCapture={captureInput}
        onMouseDownCapture={captureInput}
        onTouchStartCapture={captureInput}
      >
        <DndContext sensors={sensors} collisionDetection={pointerWithin}>
          <DndLifecycle enabled={enabled} dispatch={dispatch} />
          {children}
        </DndContext>
      </div>
    </CardInteractionContext>
  )
}
