import type { Card } from '@memebattle/ligretto-shared'
import { createContext, useContext } from 'react'

export interface StackTurn {
  /** The old top of the open stack: it flies onto the stack and turns face down. */
  leaving: Card
  /** The new top of the open stack: it flies there from the stack and turns face up. */
  arriving: Card
  /** False for the first frame, while the new top still lies on the stack, so it has a place to fly from. */
  isArriving: boolean
  /** Called when the old top has turned face down. */
  finish: () => void
}

/** `turn` is set while the open stack is being turned over into the empty stack. */
export const StackTurnContext = createContext<{ turn: StackTurn | undefined } | undefined>(undefined)

export const useStackTurn = () => {
  const context = useContext(StackTurnContext)
  if (!context) {
    throw new Error('useStackTurn must be used within StackTurnProvider')
  }
  return context.turn
}
