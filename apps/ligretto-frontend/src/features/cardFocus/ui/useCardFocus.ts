import { useCallback, useContext, useEffect, type DependencyList } from 'react'

import { CardFocusContext, type CardFocusKey } from './CardFocusContext'

interface UseCardFocusOptions {
  focusKey: CardFocusKey
  deps: DependencyList
}

export function useCardFocus(): {
  focusedCard: CardFocusKey | undefined
  clearFocus: () => void
  toggleFocus: (focusKey: CardFocusKey) => void
}
export function useCardFocus(options: UseCardFocusOptions): {
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
  const focusKey = options?.focusKey
  const deps = options?.deps ?? []
  const isFocused = !!focusKey && focusedCard === focusKey

  useEffect(
    () => () => {
      if (focusKey) {
        setFocusedCard(current => (current === focusKey ? undefined : current))
      }
    },
    // The caller-provided dependencies define the rendered card identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setFocusedCard, focusKey, ...deps],
  )

  const toggleFocus = useCallback(() => {
    if (focusKey) {
      setFocusedCard(current => (current === focusKey ? undefined : focusKey))
    }
  }, [focusKey, setFocusedCard])
  const toggleTargetFocus = useCallback(
    (nextFocusKey: CardFocusKey) => {
      setFocusedCard(current => (current === nextFocusKey ? undefined : nextFocusKey))
    },
    [setFocusedCard],
  )
  const clearFocus = useCallback(() => setFocusedCard(undefined), [setFocusedCard])

  return options
    ? {
        isFocused,
        isDimmed: !!focusedCard && !isFocused,
        toggleFocus,
        clearFocus,
      }
    : { focusedCard, clearFocus, toggleFocus: toggleTargetFocus }
}
