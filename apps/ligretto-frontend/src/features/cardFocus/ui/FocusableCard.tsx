import type { DependencyList, ReactNode } from 'react'

import type { CardFocusTarget } from './CardFocusContext'
import { useCardFocus } from './useCardFocus'

interface FocusableCardProps {
  target: CardFocusTarget
  deps: DependencyList
  children: (focus: {
    focusedCard: CardFocusTarget | undefined
    isFocused: boolean
    isDimmed: boolean
    toggleFocus: () => void
    clearFocus: () => void
  }) => ReactNode
}

export const FocusableCard = ({ target, deps, children }: FocusableCardProps) => {
  const focus = useCardFocus({ target, deps })

  return <div data-card-focus-element>{children(focus)}</div>
}
