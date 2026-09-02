import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Card } from '@memebattle/ligretto-shared'

import type { CardDragData, CardDragTarget } from '../model/types'
import { getInteractionTargetKey, useCardInteractionContext } from './CardInteractionContext'

export const useDraggableCard = (target: CardDragTarget, card: Card, disabled = false) => {
  const { enabled } = useCardInteractionContext()
  const id = `${getInteractionTargetKey(target)}.${card.color}.${card.value}`
  const data = useMemo<CardDragData>(() => ({ target, card }), [card, target])
  const { isDragging, listeners, setNodeRef } = useDraggable({ id, data, disabled: disabled || !enabled })

  return {
    id,
    isDragging,
    listeners,
    setNodeRef,
  }
}
