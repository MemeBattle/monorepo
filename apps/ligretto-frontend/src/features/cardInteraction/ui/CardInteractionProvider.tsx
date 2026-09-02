import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useHotkeys } from 'react-hotkeys-hook'
import type { Card } from '@memebattle/ligretto-shared'

import { Hotkey } from '#ducks/game'
import { Card as CardComponent } from '#entities/card'
import type { CardDragData, CardDropData, CardInteractionTarget } from '../model/types'
import { CardInteractionContext, isSameCardInteractionTarget } from './CardInteractionContext'

interface CardInteractionProviderProps extends PropsWithChildren {
  enabled: boolean
}

interface InteractionState {
  activeTarget?: CardInteractionTarget
  activeCard?: Card
}

export const CardInteractionProvider = ({ children, enabled }: CardInteractionProviderProps) => {
  const [interaction, setInteraction] = useState<InteractionState>({})
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const clearActiveTarget = useCallback((target?: CardInteractionTarget) => {
    setInteraction(current => (!target || isSameCardInteractionTarget(current.activeTarget, target) ? {} : current))
  }, [])

  const toggleActiveTarget = useCallback(
    (target: CardInteractionTarget) => {
      if (!enabled) {
        clearActiveTarget()
        return
      }
      setInteraction(current => (isSameCardInteractionTarget(current.activeTarget, target) ? {} : { activeTarget: target }))
    },
    [clearActiveTarget, enabled],
  )

  useEffect(() => {
    if (!enabled) {
      clearActiveTarget()
    }
  }, [clearActiveTarget, enabled])

  useHotkeys(
    Hotkey.escape,
    event => {
      event.preventDefault()
      clearActiveTarget()
    },
    { enabled },
  )

  useEffect(() => {
    if (!interaction.activeTarget) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-card-interaction-element]')) {
        return
      }
      clearActiveTarget()
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [clearActiveTarget, interaction.activeTarget])

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (!enabled) {
      return
    }
    const dragged = active.data.current as CardDragData | undefined
    setInteraction(dragged ? { activeTarget: dragged.target, activeCard: dragged.card } : {})
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const dragged = active.data.current as CardDragData | undefined
    const drop = over?.data.current as CardDropData | undefined
    if (enabled && dragged && drop) {
      drop.onDrop(dragged)
    }
    clearActiveTarget()
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const dragged = active.data.current as CardDragData | undefined
    const drop = over?.data.current as CardDropData | undefined
    if (enabled && dragged && drop) {
      drop.onDragOver?.(dragged)
    }
  }

  const handleDragCancel = (_event: DragCancelEvent) => clearActiveTarget()
  const value = useMemo(
    () => ({ ...interaction, enabled, clearActiveTarget, toggleActiveTarget }),
    [clearActiveTarget, enabled, interaction, toggleActiveTarget],
  )

  return (
    <CardInteractionContext value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay>{interaction.activeCard ? <CardComponent {...interaction.activeCard} data-card-drag-overlay /> : null}</DragOverlay>
      </DndContext>
    </CardInteractionContext>
  )
}
