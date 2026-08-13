import { useCallback, useContext, useEffect } from 'react'
import type { Card } from '@memebattle/ligretto-shared'

import { CardFocusContext, type CardFocusKey } from './CardFocusContext'

type FocusCard = Pick<Card, 'color' | 'value'>

type CardFocusOptions =
  | {
      type: 'open-stack'
      card: FocusCard
    }
  | {
      type: 'row'
      index: number
      card: FocusCard
    }

const getCardFocusKey = (options: CardFocusOptions): CardFocusKey =>
  options.type === 'row'
    ? `${options.type}.${options.index}.${options.card.color}.${options.card.value}`
    : `${options.type}.${options.card.color}.${options.card.value}`

export function useCardFocus(): {
  focusedCard: CardFocusKey | undefined
  clearFocus: () => void
  toggleFocus: (options: CardFocusOptions) => void
}
export function useCardFocus(options: CardFocusOptions): {
  isFocused: boolean
  isDimmed: boolean
  toggleFocus: () => void
  clearFocus: () => void
}
export function useCardFocus(options?: CardFocusOptions) {
  const context = useContext(CardFocusContext)
  if (!context) {
    throw new Error('useCardFocus must be used within CardFocusProvider')
  }

  const { focusedCard, setFocusedCard } = context
  const focusKey = options && getCardFocusKey(options)
  const isFocused = !!focusKey && focusedCard === focusKey

  useEffect(
    () => () => {
      if (focusKey) {
        setFocusedCard(current => (current === focusKey ? undefined : current))
      }
    },
    [focusKey, setFocusedCard],
  )

  const toggleFocus = useCallback(() => {
    if (focusKey) {
      setFocusedCard(current => (current === focusKey ? undefined : focusKey))
    }
  }, [focusKey, setFocusedCard])
  const toggleTargetFocus = useCallback(
    (nextOptions: CardFocusOptions) => {
      const nextFocusKey = getCardFocusKey(nextOptions)
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
