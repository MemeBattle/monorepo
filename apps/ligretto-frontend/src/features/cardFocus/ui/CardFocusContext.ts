import { createContext } from 'react'

export type CardFocusOptions = { type: 'open-stack' } | { type: 'row'; index: number }

export interface CardFocusRegistration {
  canFocus: boolean
  onActivate?: () => void
}

export const getCardFocusKey = (target: CardFocusOptions): string => (target.type === 'row' ? `${target.type}.${target.index}` : target.type)

export const isSameCardFocusTarget = (left: CardFocusOptions | undefined, right: CardFocusOptions | undefined) =>
  left === right || (!!left && !!right && getCardFocusKey(left) === getCardFocusKey(right))

export interface CardFocusContextValue {
  focusedCard?: CardFocusOptions
  clearFocus: () => void
  registerCard: (target: CardFocusOptions, registration: CardFocusRegistration) => () => void
  toggleFocus: (target: CardFocusOptions) => void
}

export const CardFocusContext = createContext<CardFocusContextValue | undefined>(undefined)
