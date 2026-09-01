import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { canPlaceCardOnDeck, type CardsDeck } from '@memebattle/ligretto-shared'

import type { CardDragData, CardDropData } from '../model/types'
import { useCardInteractionContext } from './CardInteractionContext'

export const useDroppableCard = (id: string, cardDeck: CardsDeck | null | undefined, onDrop: (dragged: CardDragData) => void) => {
  const { activeCard, enabled } = useCardInteractionContext()
  const data = useMemo<CardDropData>(
    () => ({
      onDrop: dragged => {
        if (canPlaceCardOnDeck(dragged.card, cardDeck)) {
          onDrop(dragged)
        }
      },
    }),
    [cardDeck, onDrop],
  )
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled: !enabled })
  const isValid = !!activeCard && canPlaceCardOnDeck(activeCard, cardDeck)

  return {
    isOver,
    isValid,
    setNodeRef,
  }
}
