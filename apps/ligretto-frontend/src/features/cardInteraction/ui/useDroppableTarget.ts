import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'

import type { CardDragData, CardDropData, CardDropTarget } from '../model/types'
import { useCardInteractionContext } from './CardInteractionContext'

const getDropTargetKey = (target: CardDropTarget) => `${target.type}.${target.index}`

export const useDroppableTarget = (target: CardDropTarget, onDrop: (dragged: CardDragData) => void) => {
  const { activeCard, enabled } = useCardInteractionContext()
  const id = getDropTargetKey(target)
  const data = useMemo<CardDropData>(() => ({ onDrop }), [onDrop])
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled: !enabled })

  return {
    activeCard,
    id,
    isOver,
    setNodeRef,
  }
}
