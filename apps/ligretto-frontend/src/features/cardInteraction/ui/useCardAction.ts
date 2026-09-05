import { useCallback } from 'react'
import { useCardInteractionContext } from './CardInteractionContext'
import { useCardInputEnabled } from './useCardInputEnabled'

export const useCardAction = (onActivate: () => void, available = true) => {
  const enabled = useCardInputEnabled() && available
  const { clearActiveTarget } = useCardInteractionContext()
  const activate = useCallback(() => {
    if (!enabled) {
      return
    }
    clearActiveTarget()
    onActivate()
  }, [enabled, clearActiveTarget, onActivate])
  return enabled ? activate : undefined
}
