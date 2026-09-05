import { useCallback, useContext, useEffect, type DependencyList } from 'react'

import { useCardInputEnabled } from './useCardInputEnabled'
import type { CardInteractionTarget } from '../model/types'
import { CardInteractionContext, getInteractionTargetKey, isSameCardInteractionTarget } from './CardInteractionContext'

export function useCardInteraction(): {
  activeTarget: CardInteractionTarget | undefined
  clearActiveTarget: () => void
}
export function useCardInteraction(
  target: CardInteractionTarget,
  deps: DependencyList,
): {
  isActive: boolean
  isDimmed: boolean
  toggleActiveTarget: () => void
}
export function useCardInteraction(target?: CardInteractionTarget, deps: DependencyList = []) {
  const inputEnabled = useCardInputEnabled()
  const context = useContext(CardInteractionContext)
  if (!context) {
    throw new Error('useCardInteraction must be used within CardInteractionProvider')
  }

  const { activeTarget, clearActiveTarget, toggleActiveTarget } = context
  const isActive = !!target && isSameCardInteractionTarget(activeTarget, target)
  const targetKey = target ? getInteractionTargetKey(target) : undefined

  useEffect(() => {
    if (!target) {
      return
    }
    return () => clearActiveTarget(target)
    // The caller-provided dependencies define when the rendered card identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearActiveTarget, targetKey, ...deps])

  const toggleOwnTarget = useCallback(() => {
    if (target && inputEnabled) {
      toggleActiveTarget(target)
    }
  }, [target, inputEnabled, toggleActiveTarget])

  return target
    ? {
        isActive,
        isDimmed: !!activeTarget && !isActive,
        toggleActiveTarget: toggleOwnTarget,
      }
    : { activeTarget, clearActiveTarget: () => clearActiveTarget() }
}
