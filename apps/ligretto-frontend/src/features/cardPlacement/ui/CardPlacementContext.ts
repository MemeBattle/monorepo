import { createContext, useContext } from 'react'

import type { CardDragData, CardPlacementTarget } from '../model/types'

export interface CardPlacementContextValue {
  activeDrag?: CardDragData
  enabled: boolean
  placeCard: (target: CardPlacementTarget, playgroundDeckIndex: number) => boolean
  registerSource: (source: CardDragData) => () => void
}

export const CardPlacementContext = createContext<CardPlacementContextValue | undefined>(undefined)

export const useOptionalCardPlacement = () => useContext(CardPlacementContext)
