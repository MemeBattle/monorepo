import { DragOverlay } from '@dnd-kit/core'
import { useSelector } from 'react-redux'
import last from 'lodash/last'

import { Card } from '#entities/card'
import { playerCardsSelector, playerStackOpenDeckCardsSelector } from '#ducks/game'
import { useCardDragTarget } from '#features/cardInteraction'
import type { All } from '#types/store'

export const PlayerCardDragOverlay = () => {
  const activeTarget = useCardDragTarget()
  const card = useSelector((state: All) => {
    if (activeTarget?.type === 'row') {
      return playerCardsSelector(state)?.[activeTarget.index]
    }
    if (activeTarget?.type === 'open-stack') {
      return last(playerStackOpenDeckCardsSelector(state))
    }
  })
  return <DragOverlay dropAnimation={null}>{card ? <Card {...card} data-card-drag-overlay /> : null}</DragOverlay>
}
