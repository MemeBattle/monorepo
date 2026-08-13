import { createContext, type Dispatch, type SetStateAction } from 'react'

export type CardFocusKey = string

export interface CardFocusContextValue {
  focusedCard?: CardFocusKey
  setFocusedCard: Dispatch<SetStateAction<CardFocusKey | undefined>>
}

export const CardFocusContext = createContext<CardFocusContextValue | undefined>(undefined)
