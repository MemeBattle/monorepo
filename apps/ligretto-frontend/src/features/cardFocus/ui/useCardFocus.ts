import { useCallback, useContext, useEffect, useMemo, useRef } from 'react'

import { CardFocusContext, isSameCardFocusTarget, type CardFocusTarget, type CardIdentity } from './CardFocusContext'

interface UseCardFocusOptions {
  target: CardFocusTarget
  identity: CardIdentity
}

export function useCardFocus(): {
  focusedCard: CardFocusTarget | undefined
  clearFocus: () => void
}
export function useCardFocus(options: UseCardFocusOptions): {
  focusedCard: CardFocusTarget | undefined
  isFocused: boolean
  isDimmed: boolean
  toggleFocus: () => void
  clearFocus: () => void
  cardFocusProps: { dataCardFocusElement: true }
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
  const identity = options?.identity
  const identityRef = useRef(identity)
  const isFocused = !!options && isSameCardFocusTarget(focusedCard, options.target)

  useEffect(() => {
    if (!target || !identity) {
      return
    }

    const previousIdentity = identityRef.current
    identityRef.current = identity
    if (isFocused && previousIdentity && (previousIdentity.color !== identity.color || previousIdentity.value !== identity.value)) {
      setFocusedCard(undefined)
    }
  }, [identity, isFocused, setFocusedCard, target])

  useEffect(
    () => () => {
      if (target) {
        setFocusedCard(current => (isSameCardFocusTarget(current, target) ? undefined : current))
      }
    },
    [setFocusedCard, target],
  )

  const toggleFocus = useCallback(() => {
    if (target) {
      setFocusedCard(current => (isSameCardFocusTarget(current, target) ? undefined : target))
    }
  }, [setFocusedCard, target])
  const clearFocus = useCallback(() => setFocusedCard(undefined), [setFocusedCard])

  return options
    ? {
        focusedCard,
        isFocused,
        isDimmed: !!focusedCard && !isFocused,
        toggleFocus,
        clearFocus,
        cardFocusProps: { dataCardFocusElement: true as const },
      }
    : { focusedCard, clearFocus }
}
