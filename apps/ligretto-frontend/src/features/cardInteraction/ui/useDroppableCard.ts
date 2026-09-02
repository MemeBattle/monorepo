import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'

import type { CardDragData, CardDropData } from '../model/types'
import { useCardInteractionContext } from './CardInteractionContext'

export const useDroppableCard = (id: string, onDrop: (dragged: CardDragData) => void, onDragOver?: (dragged: CardDragData) => void) => {
  const { activeCard, enabled } = useCardInteractionContext()
  const data = useMemo<CardDropData>(() => ({ onDragOver, onDrop }), [onDragOver, onDrop])
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled: !enabled })

  return {
    activeCard,
    isOver,
    setNodeRef,
  }
}
