import { DragOverlay } from '@dnd-kit/core'
import { useSelector } from 'react-redux'

import { Card } from '#entities/card'
import { cardByInteractionTarget } from '#features/cardInteraction'
import { useCardDragTarget } from '#features/cardInteraction'
import type { All } from '#types/store'

export const PlayerCardDragOverlay = () => {
  const activeTarget = useCardDragTarget()
  const card = useSelector((state: All) => cardByInteractionTarget(state, activeTarget))
  return <DragOverlay dropAnimation={null}>{card ? <Card {...card} data-card-drag-overlay /> : null}</DragOverlay>
}
