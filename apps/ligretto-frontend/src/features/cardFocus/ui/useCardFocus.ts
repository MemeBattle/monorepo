import { useCallback, useContext, useEffect, type DependencyList } from 'react'

import { CardFocusContext, isSameCardFocusTarget, type CardFocusOptions, type CardFocusRegistration } from './CardFocusContext'

export function useCardFocus(): {
  focusedCard: CardFocusOptions | undefined
  clearFocus: () => void
  toggleFocus: (target: CardFocusOptions) => void
}
export function useCardFocus(
  target: CardFocusOptions,
  deps: DependencyList,
  registration?: Partial<CardFocusRegistration>,
): {
  isFocused: boolean
  isDimmed: boolean
  toggleFocus: () => void
  clearFocus: () => void
}
export function useCardFocus(target?: CardFocusOptions, deps: DependencyList = [], registration: Partial<CardFocusRegistration> = {}) {
  const context = useContext(CardFocusContext)
  if (!context) {
    throw new Error('useCardFocus must be used within CardFocusProvider')
  }

  const { focusedCard, clearFocus, registerCard, toggleFocus } = context
  const isFocused = !!target && isSameCardFocusTarget(focusedCard, target)
  const canFocus = registration.canFocus ?? true
  const onActivate = registration.onActivate

  useEffect(() => {
    if (!target) {
      return
    }
    return registerCard(target, { canFocus, onActivate })
    // The caller-provided dependencies define when the rendered card identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFocus, onActivate, registerCard, target?.type, target?.type === 'row' ? target.index : undefined, ...deps])

  const toggleOwnFocus = useCallback(() => {
    if (target) {
      toggleFocus(target)
    }
  }, [target, toggleFocus])

  return target
    ? {
        isFocused,
        isDimmed: !!focusedCard && !isFocused,
        toggleFocus: toggleOwnFocus,
        clearFocus,
      }
    : { focusedCard, clearFocus, toggleFocus }
}
