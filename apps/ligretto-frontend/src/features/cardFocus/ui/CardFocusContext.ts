import type { Card } from '@memebattle/ligretto-shared'
import { createContext, type Dispatch, type SetStateAction } from 'react'

type FocusCard = Pick<Card, 'color' | 'value'>

export type CardFocusOptions =
  | {
      type: 'open-stack'
      card: FocusCard
    }
  | {
      type: 'row'
      index: number
      card: FocusCard
    }

export interface CardFocusContextValue {
  focusedCard?: CardFocusOptions
  setFocusedCard: Dispatch<SetStateAction<CardFocusOptions | undefined>>
}

export const CardFocusContext = createContext<CardFocusContextValue | undefined>(undefined)
