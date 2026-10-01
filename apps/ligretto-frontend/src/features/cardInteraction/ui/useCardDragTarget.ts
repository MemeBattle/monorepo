import { useDndContext } from '@dnd-kit/core'
import { useCardInteractionContext } from './CardInteractionContext'
import type { CardDragData } from '../model/types'

/** The card currently being dragged, taken from the draggable's own data — no store lookup needed. */
export const useCardDragTarget = (): CardDragData | undefined => {
  const { enabled } = useCardInteractionContext()
  const { active, draggableNodes } = useDndContext()
  const source = active ? draggableNodes.get(active.id) : undefined
  const dragged = source?.data.current as CardDragData | undefined
  return enabled && source?.node.current?.isConnected && dragged?.target ? dragged : undefined
}
