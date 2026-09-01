import { createContext, useContext } from 'react'

import type { CardDragData } from '../model/types'

export interface CardPlacementContextValue {
  activeDrag?: CardDragData
  enabled: boolean
}

export const CardPlacementContext = createContext<CardPlacementContextValue | undefined>(undefined)

export const useCardPlacement = () => {
  const context = useContext(CardPlacementContext)
  if (!context) {
    throw new Error('Card placement hooks must be used within CardPlacementProvider')
  }
  return context
}
