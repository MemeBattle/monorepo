import { useDndContext } from '@dnd-kit/core'
import { useCardInteractionContext } from './CardInteractionContext'
import type { CardDragData } from '../model/types'

export const useCardDragTarget = () => {
  const { enabled } = useCardInteractionContext()
  const { active, draggableNodes } = useDndContext()
  const source = active ? draggableNodes.get(active.id) : undefined
  const dragged = source?.data.current as CardDragData | undefined
  return enabled && source?.node.current?.isConnected && dragged?.target ? dragged.target : undefined
}
