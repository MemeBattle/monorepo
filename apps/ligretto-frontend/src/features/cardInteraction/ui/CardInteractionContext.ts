import { createContext, useContext } from 'react'
import type { CardInteractionTarget } from '../model/types'

export const getInteractionTargetKey = (target: CardInteractionTarget): string =>
  target.type === 'open-stack' ? target.type : `${target.type}.${target.index}`

export const isSameCardInteractionTarget = (left: CardInteractionTarget | undefined, right: CardInteractionTarget | undefined) =>
  left === right || (!!left && !!right && getInteractionTargetKey(left) === getInteractionTargetKey(right))

export interface CardInteractionContextValue {
  activeTarget?: CardInteractionTarget
  /** A source whose card was handed to the server and is waiting for the authoritative state. */
  placingTarget?: CardInteractionTarget
  clearActiveTarget: (target?: CardInteractionTarget) => void
  toggleActiveTarget: (target: CardInteractionTarget) => void
  startPlacing: (target: CardInteractionTarget) => void
  enabled: boolean
}

export const CardInteractionContext = createContext<CardInteractionContextValue | undefined>(undefined)

export const useCardInteractionContext = () => {
  const context = useContext(CardInteractionContext)
  if (!context) {
    throw new Error('Card interaction hooks must be used within CardInteractionProvider')
  }
  return context
}
