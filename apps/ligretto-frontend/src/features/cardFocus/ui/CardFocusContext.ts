import { createContext, type Dispatch, type SetStateAction } from 'react'

export type CardFocusTarget = { type: 'row'; index: number } | { type: 'stack-open' }

export interface CardFocusContextValue {
  focusedCard?: CardFocusTarget
  setFocusedCard: Dispatch<SetStateAction<CardFocusTarget | undefined>>
}

export const CardFocusContext = createContext<CardFocusContextValue | undefined>(undefined)

export const isSameCardFocusTarget = (left: CardFocusTarget | undefined, right: CardFocusTarget | undefined) => {
  if (!left || !right || left.type !== right.type) {
    return left === right
  }

  return left.type === 'stack-open' || left.index === (right as Extract<CardFocusTarget, { type: 'row' }>).index
}
