import { createContext, useContext } from 'react'
import type { CardInteractionTarget } from '../model/types'

export const getInteractionTargetKey = (target: CardInteractionTarget): string =>
  target.type === 'open-stack' ? target.type : `${target.type}.${target.index}`

export const isSameCardInteractionTarget = (left: CardInteractionTarget | undefined, right: CardInteractionTarget | undefined) =>
  left === right || (!!left && !!right && getInteractionTargetKey(left) === getInteractionTargetKey(right))

export interface CardInteractionContextValue {
  activeTarget?: CardInteractionTarget
  clearActiveTarget: (target?: CardInteractionTarget) => void
  toggleActiveTarget: (target: CardInteractionTarget) => void
  runCommand: (command: () => void) => void
}

export const CardInteractionContext = createContext<CardInteractionContextValue | undefined>(undefined)

export const useCardInteractionContext = () => {
  const context = useContext(CardInteractionContext)
  if (!context) {
    throw new Error('Card interaction hooks must be used within CardInteractionProvider')
  }
  return context
}
