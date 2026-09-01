import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { canPlaceCardOnDeck, type CardsDeck } from '@memebattle/ligretto-shared'

import type { CardDragData, PlaygroundDropData } from '../model/types'
import { useCardPlacement } from './CardPlacementContext'

export const useDroppableCard = (id: string, cardDeck: CardsDeck | null | undefined, onDrop: (dragged: CardDragData) => void) => {
  const { activeDrag, enabled } = useCardPlacement()
  const data = useMemo<PlaygroundDropData>(
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
  const isValid = !!activeDrag && canPlaceCardOnDeck(activeDrag.card, cardDeck)

  return {
    isOver,
    isValid,
    setNodeRef,
  }
}
