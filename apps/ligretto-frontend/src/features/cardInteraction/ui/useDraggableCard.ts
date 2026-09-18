import { useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Card } from '@memebattle/ligretto-shared'

import type { CardDragData, CardDragTarget } from '../model/types'
import { getInteractionTargetKey, useCardInteractionContext } from './CardInteractionContext'
import { useCardInteraction } from './useCardInteraction'

/** Everything a playable card needs: its drag source and its share of the interaction state. */
export const useDraggableCard = (target: CardDragTarget, card: Card) => {
  const { enabled } = useCardInteractionContext()
  const { isActive, isDimmed, isPlacing, toggleActiveTarget } = useCardInteraction(target, card)
  const id = `${getInteractionTargetKey(target)}.${card.color}.${card.value}`
  const data = useMemo<CardDragData>(() => ({ target, card }), [card, target])
  const { isDragging, listeners, setNodeRef } = useDraggable({ id, data, disabled: !enabled })

  return {
    id,
    isDragging: isDragging && enabled,
    isActive,
    isDimmed,
    isPlacing,
    toggleActiveTarget,
    listeners,
    setNodeRef,
  }
}
