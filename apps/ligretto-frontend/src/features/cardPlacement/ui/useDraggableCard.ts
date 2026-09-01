import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Card } from '@memebattle/ligretto-shared'

import type { CardDragData, CardPlacementTarget } from '../model/types'
import { useCardPlacement } from './CardPlacementContext'

const getTargetKey = (target: CardPlacementTarget) => (target.type === 'row' ? `row.${target.index}` : target.type)

export const useDraggableCard = (target: CardPlacementTarget, card: Card, disabled = false) => {
  const { enabled } = useCardPlacement()
  const id = `${getTargetKey(target)}.${card.color}.${card.value}`
  const data = useMemo<CardDragData>(() => ({ target, card }), [card, target])
  const { isDragging, listeners, setNodeRef } = useDraggable({ id, data, disabled: disabled || !enabled })

  return {
    id,
    isDragging,
    listeners,
    setNodeRef,
  }
}
