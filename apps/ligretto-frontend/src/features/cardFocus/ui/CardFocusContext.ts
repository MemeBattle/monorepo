import { createContext, type Dispatch, type SetStateAction } from 'react'

export type CardFocusOptions = { type: 'open-stack' } | { type: 'row'; index: number }

export interface CardFocusContextValue {
  focusedCard?: CardFocusOptions
  setFocusedCard: Dispatch<SetStateAction<CardFocusOptions | undefined>>
}

export const CardFocusContext = createContext<CardFocusContextValue | undefined>(undefined)
