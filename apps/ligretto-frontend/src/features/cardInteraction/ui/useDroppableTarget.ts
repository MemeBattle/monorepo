import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'

import type { CardDragData, CardDropData, CardDropTarget } from '../model/types'
import { getInteractionTargetKey } from './CardInteractionContext'

export const useDroppableTarget = (target: CardDropTarget, onDrop: (dragged: CardDragData) => void) => {
  const id = getInteractionTargetKey(target)
  const data = useMemo<CardDropData>(() => ({ target, onDrop }), [onDrop, target])
  const { isOver, setNodeRef } = useDroppable({ id, data })
  return { id, isOver, setNodeRef }
}
