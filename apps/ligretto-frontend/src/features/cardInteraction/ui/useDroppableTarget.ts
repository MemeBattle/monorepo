import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'

import type { CardDragData, CardDropData, CardDropTarget } from '../model/types'
import { getInteractionTargetKey, useCardInteractionContext } from './CardInteractionContext'

export const useDroppableTarget = (target: CardDropTarget, onDrop: (dragged: CardDragData) => void) => {
  const { enabled } = useCardInteractionContext()
  const id = getInteractionTargetKey(target)
  const data = useMemo<CardDropData>(() => ({ onDrop }), [onDrop])
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled: !enabled })

  return {
    id,
    isOver,
    setNodeRef,
  }
}
