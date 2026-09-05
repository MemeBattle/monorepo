import { useDndContext } from '@dnd-kit/core'
import { useCardInteractionContext } from './CardInteractionContext'

// A native drag owns input until release/cancel; clicks and shortcuts must not
// replace its selection or resurrect a gesture invalidated by a card update.
export const useCardInputEnabled = () => {
  const { enabled } = useCardInteractionContext()
  const { active } = useDndContext()
  return enabled && !active
}
