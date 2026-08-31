import { createContext } from 'react'

export type CardFocusOptions = { type: 'open-stack' } | { type: 'row'; index: number }

const getCardFocusKey = (target: CardFocusOptions): string => (target.type === 'row' ? `${target.type}.${target.index}` : target.type)

export const isSameCardFocusTarget = (left: CardFocusOptions | undefined, right: CardFocusOptions | undefined) =>
  left === right || (!!left && !!right && getCardFocusKey(left) === getCardFocusKey(right))

export interface CardFocusContextValue {
  focusedCard?: CardFocusOptions
  clearFocus: (target?: CardFocusOptions) => void
  toggleFocus: (target: CardFocusOptions) => void
}

export const CardFocusContext = createContext<CardFocusContextValue | undefined>(undefined)
