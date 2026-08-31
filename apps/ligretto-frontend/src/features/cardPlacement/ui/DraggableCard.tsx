import { useEffect, useMemo, type PropsWithChildren } from 'react'
import { useDraggable } from '@dnd-kit/core'

import type { CardDragData, CardPlacementTarget } from '../model/types'
import type { Card } from '@memebattle/ligretto-shared'
import { useCardPlacement } from './useCardPlacement'

interface DraggableCardProps extends PropsWithChildren {
  target: CardPlacementTarget
  card: Card
  disabled?: boolean
}

const getTargetKey = (target: CardPlacementTarget) => (target.type === 'row' ? `row.${target.index}` : target.type)

export const DraggableCard = ({ target, card, disabled = false, children }: DraggableCardProps) => {
  const { enabled, registerSource } = useCardPlacement()
  const id = `${getTargetKey(target)}.${card.color}.${card.value}`
  const data = useMemo<CardDragData>(() => ({ id, target, card }), [card, id, target])
  const { isDragging, listeners, setNodeRef } = useDraggable({ id, data, disabled: disabled || !enabled })

  useEffect(() => registerSource(data), [data, registerSource])

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      data-testid="card-drag-source"
      data-card-drag-source
      data-card-drag-id={id}
      style={{ opacity: isDragging ? 0.35 : 1, touchAction: 'none' }}
    >
      {children}
    </div>
  )
}
