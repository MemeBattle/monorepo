import { useContext } from 'react'

import { CardPlacementContext } from './CardPlacementContext'

export const useCardPlacement = () => {
  const context = useContext(CardPlacementContext)
  if (!context) {
    throw new Error('useCardPlacement must be used within CardPlacementProvider')
  }
  return context
}
