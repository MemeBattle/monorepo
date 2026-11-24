import { createContext } from 'react'

interface CardAnimationContextValue {
  isEnabled: boolean
  /** Names of the cards last drawn face down: such a card turns face up when it next appears face up. */
  faceDownNames: Set<string>
}

export const CardAnimationContext = createContext<CardAnimationContextValue>({ isEnabled: false, faceDownNames: new Set() })
