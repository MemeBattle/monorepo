import { DragOverlay } from '@dnd-kit/core'

import { Card } from '#entities/card'
import { useCardDragTarget } from './useCardDragTarget'

/** The card that follows the pointer during a drag. Its data comes from the drag source itself. */
export const CardDragOverlay = () => {
  const dragged = useCardDragTarget()
  return <DragOverlay dropAnimation={null}>{dragged ? <Card {...dragged.card} data-card-drag-overlay /> : null}</DragOverlay>
}
