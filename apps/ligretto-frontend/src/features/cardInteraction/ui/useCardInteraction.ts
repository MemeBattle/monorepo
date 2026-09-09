import { useCallback, useContext, useEffect } from 'react'

import { useSelector } from 'react-redux'
import type { All } from '#types/store'

import type { CardInteractionTarget } from '../model/types'
import { CardInteractionContext, getInteractionTargetKey, isSameCardInteractionTarget } from './CardInteractionContext'

export function useCardInteraction(): {
  activeTarget: CardInteractionTarget | undefined
  clearActiveTarget: () => void
}
export function useCardInteraction(target: CardInteractionTarget): {
  isActive: boolean
  isDimmed: boolean
  toggleActiveTarget: () => void
}
export function useCardInteraction(target?: CardInteractionTarget) {
  const context = useContext(CardInteractionContext)
  if (!context) {
    throw new Error('useCardInteraction must be used within CardInteractionProvider')
  }

  const { activeTarget, clearActiveTarget, toggleActiveTarget } = context
  const card = useSelector((state: All) => context.cardByTargetSelector(state, target))
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
        toggleActiveTarget: toggleOwnTarget,
      }
    : { activeTarget, clearActiveTarget: () => clearActiveTarget() }
}
