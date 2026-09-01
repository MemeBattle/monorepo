import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { canPlaceCardOnDeck, type CardsDeck } from '@memebattle/ligretto-shared'

import type { CardDragData, PlaygroundDropData } from '../model/types'
import { useOptionalCardPlacement } from './CardPlacementContext'

export const useDroppableCard = (id: string, cardDeck: CardsDeck | null | undefined, onDrop: (dragged: CardDragData) => void) => {
  const placement = useOptionalCardPlacement()
  const activeDrag = placement?.activeDrag
  const enabled = placement?.enabled ?? false
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
  const boxShadow = activeDrag
    ? isValid
      ? isOver
        ? '0 0 0 0.3rem #6ee7a0'
        : '0 0 0 0.2rem rgba(110, 231, 160, 0.7)'
      : isOver
        ? '0 0 0 0.3rem #f87171'
        : undefined
    : undefined

  return {
    ref: setNodeRef,
    'data-card-drop-target': id,
    'data-drop-valid': activeDrag ? isValid : undefined,
    'data-drop-over': isOver || undefined,
    style: {
      borderRadius: '0.375rem',
      boxShadow,
      transition: 'box-shadow 100ms',
    },
  } as const
}
