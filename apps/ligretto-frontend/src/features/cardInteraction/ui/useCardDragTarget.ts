import { useDndContext } from '@dnd-kit/core'
import { useCardInteractionContext, isSameCardInteractionTarget } from './CardInteractionContext'
import type { CardDragData } from '../model/types'

export const useCardDragTarget = () => {
  const { active } = useDndContext()
  const { activeTarget, enabled } = useCardInteractionContext()
  const dragged = active?.data.current as CardDragData | undefined
  return enabled && active && dragged?.target && isSameCardInteractionTarget(activeTarget, dragged.target) ? dragged.target : undefined
}
