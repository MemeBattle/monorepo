import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Card } from '@memebattle/ligretto-shared'

import type { CardDragData, CardInteractionTarget } from '../model/types'
import { useCardInteractionContext } from './CardInteractionContext'

const getTargetKey = (target: CardInteractionTarget) => (target.type === 'row' ? `row.${target.index}` : target.type)

export const useDraggableCard = (target: CardInteractionTarget, card: Card, disabled = false) => {
  const { enabled } = useCardInteractionContext()
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
