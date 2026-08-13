import { useCallback, useContext, useEffect } from 'react'

import { CardFocusContext, type CardFocusOptions } from './CardFocusContext'

const getCardFocusKey = (target: CardFocusOptions): string =>
  target.type === 'row'
    ? `${target.type}.${target.index}.${target.card.color}.${target.card.value}`
    : `${target.type}.${target.card.color}.${target.card.value}`

const isSameCardFocusTarget = (left: CardFocusOptions | undefined, right: CardFocusOptions | undefined) =>
  left === right ||
  (!!left &&
    !!right &&
    left.type === right.type &&
    left.card.color === right.card.color &&
    left.card.value === right.card.value &&
    (left.type === 'open-stack' || (right.type === 'row' && left.index === right.index)))

export function useCardFocus(): {
  focusedCard: CardFocusOptions | undefined
  clearFocus: () => void
  toggleFocus: (target: CardFocusOptions) => void
}
export function useCardFocus(target: CardFocusOptions): {
  isFocused: boolean
  isDimmed: boolean
  toggleFocus: () => void
  clearFocus: () => void
}
export function useCardFocus(target?: CardFocusOptions) {
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
    [focusKey, setFocusedCard],
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
