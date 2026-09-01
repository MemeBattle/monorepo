import { useEffect, useMemo, useState, type PropsWithChildren } from 'react'
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
  type DragStartEvent,
} from '@dnd-kit/core'

import { Card } from '#entities/card'
import type { CardDragData, PlaygroundDropData } from '../model/types'
import { CardPlacementContext } from './CardPlacementContext'

interface CardPlacementProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardPlacementProvider = ({ children, enabled }: CardPlacementProviderProps) => {
  const [activeDrag, setActiveDrag] = useState<CardDragData>()
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  useEffect(() => {
    if (!enabled) {
      setActiveDrag(undefined)
    }
  }, [enabled])

  const handleDragStart = ({ active }: DragStartEvent) => {
    if (enabled) {
      setActiveDrag(active.data.current as CardDragData | undefined)
    }
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const dragged = active.data.current as CardDragData | undefined
    const drop = over?.data.current as PlaygroundDropData | undefined
    if (dragged && drop) {
      drop.onDrop(dragged)
    }
    setActiveDrag(undefined)
  }

  const handleDragCancel = (_event: DragCancelEvent) => setActiveDrag(undefined)
  const value = useMemo(() => ({ activeDrag, enabled }), [activeDrag, enabled])

  return (
    <CardPlacementContext value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay>{activeDrag ? <Card {...activeDrag.card} data-card-drag-overlay /> : null}</DragOverlay>
      </DndContext>
    </CardPlacementContext>
  )
}
