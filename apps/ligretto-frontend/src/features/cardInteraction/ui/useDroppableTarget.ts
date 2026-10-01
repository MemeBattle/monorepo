import { useCallback } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { Card } from '@memebattle/ligretto-shared'

import type { CardDragTarget, CardDropData, CardDropTarget } from '../model/types'
import { getInteractionTargetKey, useCardInteractionContext } from './CardInteractionContext'
import { useCardInteraction } from './useCardInteraction'

/**
 * Both ways a card reaches a destination — released on it, or picked and then clicked onto it.
 * `onPlace` decides whether the placement is legal and issues the command.
 */
export const useDroppableTarget = (target: CardDropTarget, onPlace: (source: CardDragTarget, card?: Card) => void) => {
  const { enabled } = useCardInteractionContext()
  const { activeTarget } = useCardInteraction()

  const place = useCallback(
    (source: CardDragTarget, card?: Card) => {
      if (enabled) {
        onPlace(source, card)
      }
    },
    [enabled, onPlace],
  )

  const id = getInteractionTargetKey(target)
  const data: CardDropData = { target, onDrop: dragged => place(dragged.target, dragged.card) }
  const { setNodeRef } = useDroppable({ id, data, disabled: !enabled })

  const onClick = useCallback(() => {
    if (activeTarget && activeTarget.type !== 'playground') {
      place(activeTarget)
    }
  }, [activeTarget, place])

  return { id, onClick, setNodeRef }
}
