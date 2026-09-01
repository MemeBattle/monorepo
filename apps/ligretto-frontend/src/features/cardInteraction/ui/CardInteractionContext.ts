import { createContext, useContext } from 'react'
import type { Card } from '@memebattle/ligretto-shared'

import type { CardInteractionTarget } from '../model/types'

export const getCardInteractionKey = (target: CardInteractionTarget): string =>
  target.type === 'row' ? `${target.type}.${target.index}` : target.type

export const isSameCardInteractionTarget = (left: CardInteractionTarget | undefined, right: CardInteractionTarget | undefined) =>
  left === right || (!!left && !!right && getCardInteractionKey(left) === getCardInteractionKey(right))

export interface CardInteractionContextValue {
  activeTarget?: CardInteractionTarget
  activeCard?: Card
  enabled: boolean
  clearActiveTarget: (target?: CardInteractionTarget) => void
  toggleActiveTarget: (target: CardInteractionTarget) => void
}

export const CardInteractionContext = createContext<CardInteractionContextValue | undefined>(undefined)

export const useCardInteractionContext = () => {
  const context = useContext(CardInteractionContext)
  if (!context) {
    throw new Error('Card interaction hooks must be used within CardInteractionProvider')
  }
  return context
}
