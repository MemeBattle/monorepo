import { useCallback, useContext, useEffect, useMemo, type DependencyList } from 'react'

import { CardFocusContext, isSameCardFocusTarget, type CardFocusTarget } from './CardFocusContext'

interface UseCardFocusOptions {
  target: CardFocusTarget
  deps: DependencyList
}

export function useCardFocus(): {
  focusedCard: CardFocusTarget | undefined
  clearFocus: () => void
  toggleFocus: (target: CardFocusTarget) => void
}
export function useCardFocus(options: UseCardFocusOptions): {
  focusedCard: CardFocusTarget | undefined
  isFocused: boolean
  isDimmed: boolean
  toggleFocus: () => void
  clearFocus: () => void
}
export function useCardFocus(options?: UseCardFocusOptions) {
  const context = useContext(CardFocusContext)
  if (!context) {
    throw new Error('useCardFocus must be used within CardFocusProvider')
  }

  const { focusedCard, setFocusedCard } = context
  const targetType = options?.target.type
  const targetIndex = options?.target.type === 'row' ? options.target.index : undefined
  const target = useMemo<CardFocusTarget | undefined>(
    () => (targetType === 'row' ? { type: 'row', index: targetIndex! } : targetType === 'stack-open' ? { type: 'stack-open' } : undefined),
    [targetIndex, targetType],
  )
  const deps = options?.deps ?? []
  const isFocused = !!options && isSameCardFocusTarget(focusedCard, options.target)

  useEffect(
    () => () => {
      if (target) {
        setFocusedCard(current => (isSameCardFocusTarget(current, target) ? undefined : current))
      }
    },
    // The caller-provided dependencies define the rendered card identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setFocusedCard, target, ...deps],
  )

  const toggleFocus = useCallback(() => {
    if (target) {
      setFocusedCard(current => (isSameCardFocusTarget(current, target) ? undefined : target))
    }
  }, [setFocusedCard, target])
  const toggleTargetFocus = useCallback(
    (nextTarget: CardFocusTarget) => {
      setFocusedCard(current => (isSameCardFocusTarget(current, nextTarget) ? undefined : nextTarget))
    },
    [setFocusedCard],
  )
  const clearFocus = useCallback(() => setFocusedCard(undefined), [setFocusedCard])

  return options
    ? {
        focusedCard,
        isFocused,
        isDimmed: !!focusedCard && !isFocused,
        toggleFocus,
        clearFocus,
      }
    : { focusedCard, clearFocus, toggleFocus: toggleTargetFocus }
}
