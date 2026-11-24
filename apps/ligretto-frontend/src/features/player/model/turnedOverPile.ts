import type { Card } from '@memebattle/ligretto-shared'
import last from 'lodash/last'

export interface HandDecks {
  stack: Card[] | undefined
  open: Card[] | undefined
}

/**
 * The open stack's top before and after the move, when the move turned the open stack over into an empty stack.
 * Only such a move keeps every card of the hand while the stack was empty; a card played from the open stack leaves
 * one fewer.
 */
export const turnedOverPile = (previous: HandDecks, next: HandDecks): { leaving: Card; arriving: Card } | undefined => {
  const leaving = last(previous.open)
  const arriving = last(next.open)
  if (previous.stack?.length !== 0 || !leaving?.id || !arriving?.id || leaving.id === arriving.id) {
    return undefined
  }
  const cardsBefore = previous.open?.length ?? 0
  const cardsAfter = (next.stack?.length ?? 0) + (next.open?.length ?? 0)

  return cardsAfter === cardsBefore ? { leaving, arriving } : undefined
}
