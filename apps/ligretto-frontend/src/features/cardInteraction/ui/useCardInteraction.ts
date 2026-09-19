import { useCallback, useContext, useEffect } from 'react'

import type { Card } from '@memebattle/ligretto-shared'

import type { CardInteractionTarget } from '../model/types'
import { CardInteractionContext, getInteractionTargetKey, isSameCardInteractionTarget } from './CardInteractionContext'

export function useCardInteraction(): {
  activeTarget: CardInteractionTarget | undefined
  clearActiveTarget: () => void
  startPlacing: (target: CardInteractionTarget) => void
}
export function useCardInteraction(
  target: CardInteractionTarget,
  card?: Card,
): {
  isActive: boolean
  isDimmed: boolean
  isPlacing: boolean
  toggleActiveTarget: () => void
}
export function useCardInteraction(target?: CardInteractionTarget, card?: Card) {
  const context = useContext(CardInteractionContext)
  if (!context) {
    throw new Error('useCardInteraction must be used within CardInteractionProvider')
  }

  const { activeTarget, placingTarget, clearActiveTarget, toggleActiveTarget, startPlacing } = context
  const isActive = !!target && isSameCardInteractionTarget(activeTarget, target)
  const targetKey = target ? getInteractionTargetKey(target) : undefined

  useEffect(() => {
    if (!target) {
      return
    }
    return () => clearActiveTarget(target)
    // Clear by semantic card values, not object allocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearActiveTarget, targetKey, card?.color, card?.value])

  const toggleOwnTarget = useCallback(() => {
    if (target) {
      toggleActiveTarget(target)
    }
  }, [target, toggleActiveTarget])

  return target
    ? {
        isActive,
        isDimmed: !!activeTarget && !isActive,
        isPlacing: isSameCardInteractionTarget(placingTarget, target),
        toggleActiveTarget: toggleOwnTarget,
      }
    : { activeTarget, clearActiveTarget: () => clearActiveTarget(), startPlacing }
}
