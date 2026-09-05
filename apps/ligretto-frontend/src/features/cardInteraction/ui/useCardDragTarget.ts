import { useDndContext } from '@dnd-kit/core'
import type { CardDragData } from '../model/types'

export const useCardDragTarget = () => {
  const { active, draggableNodes } = useDndContext()
  const source = active ? draggableNodes.get(active.id) : undefined
  const dragged = source?.data.current as CardDragData | undefined
  return source?.node.current?.isConnected && dragged?.target && !dragged.disabled ? dragged.target : undefined
}
