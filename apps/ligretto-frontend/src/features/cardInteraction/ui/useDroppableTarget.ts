import { useDndContext, useDndMonitor, useDroppable } from '@dnd-kit/core'

import type { CardDragData, CardDropTarget } from '../model/types'
import { getInteractionTargetKey, isSameCardInteractionTarget, useCardInteractionContext } from './CardInteractionContext'

export const useDroppableTarget = (target: CardDropTarget, onDrop: (dragged: CardDragData) => void) => {
  const { enabled, activeTarget } = useCardInteractionContext()
  const { draggableNodes, droppableContainers } = useDndContext()
  const id = getInteractionTargetKey(target)
  const { isOver, setNodeRef } = useDroppable({ id, disabled: !enabled })

  useDndMonitor({
    onDragEnd({ active, over }) {
      const dragged = active.data.current as CardDragData | undefined
      // dnd-kit retains active data after a source disappears. Only a live,
      // unchanged source and destination may complete the original gesture.
      if (
        enabled &&
        activeTarget &&
        dragged?.target &&
        over?.id === id &&
        draggableNodes.get(active.id)?.node.current?.isConnected &&
        droppableContainers.get(id)?.node.current?.isConnected &&
        isSameCardInteractionTarget(activeTarget, dragged.target)
      ) {
        onDrop(dragged)
      }
    },
  })

  return { id, isOver: enabled && !!activeTarget && isOver, setNodeRef }
}
