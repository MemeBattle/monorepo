import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { DndContext, MouseSensor, TouchSensor, pointerWithin, useSensor, useSensors, type DragStartEvent } from '@dnd-kit/core'
import { useHotkeys } from 'react-hotkeys-hook'

import type { CardInteractionTarget } from '../model/types'
import { CardInteractionContext, isSameCardInteractionTarget } from './CardInteractionContext'

interface CardInteractionProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardInteractionProvider = ({ children, enabled }: CardInteractionProviderProps) => {
  const [activeTarget, setActiveTarget] = useState<CardInteractionTarget>()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const clearActiveTarget = useCallback((target?: CardInteractionTarget) => {
    setActiveTarget(current => (!target || isSameCardInteractionTarget(current, target) ? undefined : current))
  }, [])

  const toggleActiveTarget = useCallback(
    (target: CardInteractionTarget) => {
      if (!enabled) {
        return
      }
      setActiveTarget(current => (isSameCardInteractionTarget(current, target) ? undefined : target))
    },
    [enabled],
  )

  useEffect(() => {
    if (!enabled) {
      clearActiveTarget()
    }
  }, [clearActiveTarget, enabled])

  useHotkeys(
    'escape',
    event => {
      event.preventDefault()
      clearActiveTarget()
    },
    { enabled },
  )

  useEffect(() => {
    if (!activeTarget) {
      return
    }
    const handleDocumentClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-card-interaction-element]')) {
        return
      }
      clearActiveTarget()
    }
    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [clearActiveTarget, activeTarget])

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (enabled) {
      setActiveTarget(active.data.current?.target as CardInteractionTarget | undefined)
    }
  }
  const value = useMemo(
    () => ({ activeTarget: enabled ? activeTarget : undefined, enabled, clearActiveTarget, toggleActiveTarget }),
    [clearActiveTarget, enabled, activeTarget, toggleActiveTarget],
  )

  return (
    <CardInteractionContext value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={() => clearActiveTarget()}
        onDragCancel={() => clearActiveTarget()}
      >
        {children}
      </DndContext>
    </CardInteractionContext>
  )
}
