import { useCallback, useContext, useEffect, type DependencyList } from 'react'

import { CardFocusContext, type CardFocusOptions } from './CardFocusContext'

const getCardFocusKey = (target: CardFocusOptions): string => (target.type === 'row' ? `${target.type}.${target.index}` : target.type)

const isSameCardFocusTarget = (left: CardFocusOptions | undefined, right: CardFocusOptions | undefined) =>
  left === right || (!!left && !!right && getCardFocusKey(left) === getCardFocusKey(right))

export function useCardFocus(): {
  focusedCard: CardFocusOptions | undefined
  clearFocus: () => void
  toggleFocus: (target: CardFocusOptions) => void
}
export function useCardFocus(
  target: CardFocusOptions,
  deps: DependencyList,
): {
  isFocused: boolean
  isDimmed: boolean
  toggleFocus: () => void
  clearFocus: () => void
}
export function useCardFocus(target?: CardFocusOptions, deps: DependencyList = []) {
  const context = useContext(CardFocusContext)
  if (!context) {
    throw new Error('useCardFocus must be used within CardFocusProvider')
  }

  const { focusedCard, setFocusedCard } = context
  const focusKey = target && getCardFocusKey(target)
  const isFocused = !!target && isSameCardFocusTarget(focusedCard, target)

  useEffect(
    () => () => {
      if (focusKey) {
        setFocusedCard(current => (current && getCardFocusKey(current) === focusKey ? undefined : current))
      }
    },
    // The caller-provided dependencies define when the rendered card identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focusKey, setFocusedCard, ...deps],
  )

  const toggleFocus = useCallback(() => {
    if (target) {
      setFocusedCard(current => (isSameCardFocusTarget(current, target) ? undefined : target))
    }
  }, [setFocusedCard, target])
  const toggleTargetFocus = useCallback(
    (nextTarget: CardFocusOptions) => {
      setFocusedCard(current => (isSameCardFocusTarget(current, nextTarget) ? undefined : nextTarget))
    },
    [setFocusedCard],
  )
  const clearFocus = useCallback(() => setFocusedCard(undefined), [setFocusedCard])

  return target
    ? {
        isFocused,
        isDimmed: !!focusedCard && !isFocused,
        toggleFocus,
        clearFocus,
      }
    : { focusedCard, clearFocus, toggleFocus: toggleTargetFocus }
}
