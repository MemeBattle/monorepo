import type { Card } from '@memebattle/ligretto-shared'
import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useSelector } from 'react-redux'

import { playerStackDeckCardsSelector, playerStackOpenDeckCardsSelector } from '#ducks/game'
import { turnedOverPile, type HandDecks } from '../../model/turnedOverPile'
import { StackTurnContext } from './StackTurnContext'

/**
 * Notices the open stack being turned over into the empty stack. The server sends that move and the three cards drawn
 * right after it as one update, where no card is seen leaving one deck for the other, so the two decks show it
 * themselves.
 */
export const StackTurnProvider = ({ children }: PropsWithChildren) => {
  const stack = useSelector(playerStackDeckCardsSelector)
  const open = useSelector(playerStackOpenDeckCardsSelector)
  const [previous, setPrevious] = useState<HandDecks>({ stack, open })
  const [turned, setTurned] = useState<{ leaving: Card; arriving: Card; isArriving: boolean }>()

  if (previous.stack !== stack || previous.open !== open) {
    setPrevious({ stack, open })
    const pile = turnedOverPile(previous, { stack, open })
    if (pile) {
      setTurned({ ...pile, isArriving: false })
    }
  }

  useEffect(() => {
    if (!turned || turned.isArriving) {
      return
    }
    const frame = requestAnimationFrame(() => setTurned(current => current && { ...current, isArriving: true }))
    return () => cancelAnimationFrame(frame)
  }, [turned])

  const finish = useCallback(() => setTurned(undefined), [])
  const value = useMemo(() => ({ turn: turned && { ...turned, finish } }), [turned, finish])

  return <StackTurnContext value={value}>{children}</StackTurnContext>
}
