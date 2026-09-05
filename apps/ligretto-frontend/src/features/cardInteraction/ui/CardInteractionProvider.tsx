import { useCallback, useEffect, useMemo, useReducer, useRef, type MouseEvent, type PropsWithChildren } from 'react'
import { DndContext, pointerWithin, useDndContext, useDndMonitor, useSensor, useSensors, type UniqueIdentifier } from '@dnd-kit/core'
import { useHotkeys } from 'react-hotkeys-hook'

import type { CardDragData, CardDropData, CardInteractionTarget } from '../model/types'
import { CardInteractionContext, getInteractionTargetKey, isSameCardInteractionTarget } from './CardInteractionContext'
import { CancellableMouseSensor, CancellableTouchSensor, type RegisterSensorCancellation } from './CancellableSensors'

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
  | { type: 'dragTerminal'; sourceId?: UniqueIdentifier }

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
      return state.mode === 'dragging' && (!action.sourceId || state.sourceId === action.sourceId) ? { mode: 'idle' } : state
  }
}

const DndLifecycle = ({ enabled, state, dispatch }: { enabled: boolean; state: State; dispatch: React.Dispatch<Action> }) => {
  const { draggableNodes, droppableContainers } = useDndContext()
  useDndMonitor({
    onDragStart({ active }) {
      const target = active.data.current?.target as CardInteractionTarget | undefined
      if (enabled && target) {
        dispatch({ type: 'dragStart', target, sourceId: active.id })
      }
    },
    onDragEnd({ active, over }) {
      const dragged = active.data.current as CardDragData | undefined
      const destination = over?.data.current as CardDropData | undefined
      if (
        enabled &&
        state.mode === 'dragging' &&
        state.sourceId === active.id &&
        dragged?.target &&
        destination?.onDrop &&
        isSameCardInteractionTarget(state.target, dragged.target) &&
        draggableNodes.get(active.id)?.node.current?.isConnected &&
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
  const cancelSensorRef = useRef<(() => void) | undefined>(undefined)
  const enabledRef = useRef(enabled)
  const sensorSourceRef = useRef<UniqueIdentifier | undefined>(undefined)
  const suppressReleaseClickRef = useRef(false)
  const releaseCleanupRef = useRef<(() => void) | undefined>(undefined)
  enabledRef.current = enabled

  const registerCancellation = useCallback<RegisterSensorCancellation>((cancel, sourceId) => {
    sensorSourceRef.current = sourceId
    const cancelAndGuardRelease = () => {
      releaseCleanupRef.current?.()
      const onRelease = () => {
        suppressReleaseClickRef.current = true
        cleanup()
      }
      const cleanup = () => {
        document.removeEventListener('mouseup', onRelease, true)
        document.removeEventListener('touchend', onRelease, true)
        releaseCleanupRef.current = undefined
      }
      document.addEventListener('mouseup', onRelease, true)
      document.addEventListener('touchend', onRelease, true)
      releaseCleanupRef.current = cleanup
      cancel()
    }
    cancelSensorRef.current = cancelAndGuardRelease
    return () => {
      if (cancelSensorRef.current === cancelAndGuardRelease) {
        cancelSensorRef.current = undefined
        sensorSourceRef.current = undefined
      }
    }
  }, [])
  const sensors = useSensors(
    useSensor(CancellableMouseSensor, { activationConstraint: { distance: 6 }, registerCancellation }),
    useSensor(CancellableTouchSensor, { activationConstraint: { delay: 150, tolerance: 8 }, registerCancellation }),
  )
  const activeTarget = state.mode === 'idle' ? undefined : state.target
  const clearActiveTarget = useCallback((target?: CardInteractionTarget) => {
    if (!target || String(sensorSourceRef.current).startsWith(`${getInteractionTargetKey(target)}.`)) {
      cancelSensorRef.current?.()
    }
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
    cancelSensorRef.current?.()
    dispatch({ type: 'dragTerminal' })
    dispatch({ type: 'clear' })
    command()
  }, [])

  useEffect(() => {
    if (!enabled) {
      cancelSensorRef.current?.()
      dispatch({ type: 'dragTerminal' })
      dispatch({ type: 'clear' })
    }
  }, [enabled])
  useEffect(() => {
    // A new physical gesture is deliberate input, not the cancelled one's click.
    const resetReleaseGuard = () => {
      releaseCleanupRef.current?.()
      suppressReleaseClickRef.current = false
    }
    // Compatibility mouse events after touchend are not a new pointer gesture.
    document.addEventListener('pointerdown', resetReleaseGuard, true)
    document.addEventListener('touchstart', resetReleaseGuard, true)
    return () => {
      document.removeEventListener('pointerdown', resetReleaseGuard, true)
      document.removeEventListener('touchstart', resetReleaseGuard, true)
      cancelSensorRef.current?.()
      releaseCleanupRef.current?.()
    }
  }, [])
  useHotkeys(
    'escape',
    event => {
      event.preventDefault()
      cancelSensorRef.current?.()
      dispatch({ type: 'dragTerminal' })
      dispatch({ type: 'clear' })
    },
    { enabled },
  )
  useEffect(() => {
    if (state.mode !== 'focused') {
      return
    }
    const listener = (event: globalThis.MouseEvent) => {
      if (suppressReleaseClickRef.current) {
        suppressReleaseClickRef.current = false
        return
      }
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
  const captureClick = (event: MouseEvent) => {
    if (!enabled || suppressReleaseClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      suppressReleaseClickRef.current = false
    }
  }
  const capturePointerStart = (event: React.SyntheticEvent) => {
    if (!enabled || suppressReleaseClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  return (
    <CardInteractionContext value={value}>
      <div
        style={{ display: 'contents' }}
        onClickCapture={captureClick}
        onPointerDownCapture={capturePointerStart}
        onMouseDownCapture={capturePointerStart}
        onTouchStartCapture={capturePointerStart}
      >
        <DndContext sensors={sensors} collisionDetection={pointerWithin}>
          <DndLifecycle enabled={enabled} state={state} dispatch={dispatch} />
          {children}
        </DndContext>
      </div>
    </CardInteractionContext>
  )
}
