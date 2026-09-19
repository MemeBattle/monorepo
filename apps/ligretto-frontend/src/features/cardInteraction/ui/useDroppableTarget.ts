import { useCallback, useMemo } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Card } from '@memebattle/ligretto-shared'

import type { CardDragTarget, CardDropData, CardDropTarget } from '../model/types'
import { getInteractionTargetKey, useCardInteractionContext } from './CardInteractionContext'
import { useCardInteraction } from './useCardInteraction'

/**
 * Both ways a card reaches a destination — released on it, or picked and then clicked onto it.
 * `onPlace` decides whether the placement is legal and returns whether it dispatched a command;
 * an accepted placement puts its source into the placing state until the server answers.
 */
export const useDroppableTarget = (target: CardDropTarget, onPlace: (source: CardDragTarget, card?: Card) => boolean) => {
  const { enabled } = useCardInteractionContext()
  const { activeTarget, startPlacing } = useCardInteraction()

  const place = useCallback(
    (source: CardDragTarget, card?: Card) => {
      if (enabled && onPlace(source, card)) {
        startPlacing(source)
      }
    },
    [enabled, onPlace, startPlacing],
  )

  const id = getInteractionTargetKey(target)
  const data = useMemo<CardDropData>(() => ({ target, onDrop: dragged => place(dragged.target, dragged.card) }), [place, target])
  const { isOver, setNodeRef } = useDroppable({ id, data, disabled: !enabled })

  const onClick = useCallback(() => {
    if (activeTarget && activeTarget.type !== 'playground') {
      place(activeTarget)
    }
  }, [activeTarget, place])

  return { id, isOver, onClick, setNodeRef }
}
