import { useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSelector, useStore } from 'react-redux'
import { canPlaceCardOnDeck } from '@memebattle/ligretto-shared'

import { playgroundDecksSelector } from '#ducks/game'
import type { All } from '#types/store'
import type { CardDragData, CardDropData, CardDropTarget } from '../model/types'
import { cardByInteractionTarget } from '../model/cardByInteractionTarget'
import { getInteractionTargetKey, useCardInteractionContext } from './CardInteractionContext'
import { useCardDragTarget } from './useCardDragTarget'

export const useDroppableTarget = (target: CardDropTarget, onDrop: (dragged: CardDragData) => void) => {
  const { activeTarget, enabled } = useCardInteractionContext()
  const dragTarget = useCardDragTarget()
  const activeCard = useSelector((state: All) => cardByInteractionTarget(state, dragTarget ?? activeTarget))
  const deck = useSelector((state: All) => playgroundDecksSelector(state)[target.index])
  const store = useStore<All>()
  const id = getInteractionTargetKey(target)
  const isValid = enabled && !!activeCard && canPlaceCardOnDeck(activeCard, deck)
  const data = useMemo<CardDropData>(
    () => ({
      target,
      onDrop: dragged => {
        const state = store.getState()
        const card = cardByInteractionTarget(state, dragged.target)
        const destination = playgroundDecksSelector(state)[target.index]
        if (enabled && card?.color === dragged.card.color && card?.value === dragged.card.value && canPlaceCardOnDeck(card, destination)) {
          onDrop(dragged)
        }
      },
    }),
    [enabled, onDrop, store, target],
  )
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled: !enabled })
  return { id, isOver, isValid, setNodeRef }
}
