import { useCallback, useEffect, useMemo, useState, type Dispatch, type PropsWithChildren, type SetStateAction } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useDispatch, useSelector } from 'react-redux'

import {
  Hotkey,
  playerCardsSelector,
  playerStackOpenDeckCardsSelector,
  tapCardAction,
  tapLigrettoDeckCardAction,
  tapStackDeckCardAction,
  tapStackOpenDeckCardAction,
} from '#ducks/game'
import { CardFocusContext, isSameCardFocusTarget, type CardFocusTarget } from './CardFocusContext'

interface CardFocusProviderProps extends PropsWithChildren {
  enabled: boolean
}

const rowHotkeyIndices = new Map<string, number>([
  [Hotkey.q, 0],
  [Hotkey.w, 1],
  [Hotkey.e, 2],
  [Hotkey.r, 3],
  [Hotkey.t, 4],
])

export const CardFocusProvider = ({ children, enabled }: CardFocusProviderProps) => {
  const dispatch = useDispatch()
  const playerCards = useSelector(playerCardsSelector)
  const stackOpenDeckCards = useSelector(playerStackOpenDeckCardsSelector)
  const stackOpenDeckCard = stackOpenDeckCards?.[stackOpenDeckCards.length - 1]
  const [focusedCard, setFocusedCard] = useState<CardFocusTarget>()

  const setEnabledFocusedCard = useCallback<Dispatch<SetStateAction<CardFocusTarget | undefined>>>(
    update => {
      setFocusedCard(current => {
        if (!enabled) {
          return undefined
        }
        return typeof update === 'function' ? update(current) : update
      })
    },
    [enabled],
  )

  const toggleFocusedCard = useCallback((target: CardFocusTarget) => {
    setFocusedCard(current => (isSameCardFocusTarget(current, target) ? undefined : target))
  }, [])

  useEffect(() => {
    if (!enabled) {
      setFocusedCard(undefined)
    }
  }, [enabled])

  useEffect(() => {
    if (!focusedCard) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-card-focus-element]')) {
        return
      }
      setFocusedCard(undefined)
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [focusedCard])

  useHotkeys(
    Object.values(Hotkey).join(','),
    (event, handler) => {
      event.preventDefault()

      const rowCardIndex = rowHotkeyIndices.get(handler.hotkey)
      if (typeof rowCardIndex === 'number') {
        const card = playerCards?.[rowCardIndex]
        if (!card) {
          setFocusedCard(undefined)
        } else if (card.value === 1) {
          setFocusedCard(undefined)
          dispatch(tapCardAction({ cardIndex: rowCardIndex }))
        } else {
          toggleFocusedCard({ type: 'row', index: rowCardIndex })
        }
        return
      }

      switch (handler.hotkey) {
        case Hotkey.x:
          if (!stackOpenDeckCard) {
            setFocusedCard(undefined)
          } else if (stackOpenDeckCard.value === 1) {
            setFocusedCard(undefined)
            dispatch(tapStackOpenDeckCardAction())
          } else {
            toggleFocusedCard({ type: 'stack-open' })
          }
          break
        case Hotkey.space:
          setFocusedCard(undefined)
          dispatch(tapStackDeckCardAction())
          break
        case Hotkey.l:
          dispatch(tapLigrettoDeckCardAction())
          break
        case Hotkey.escape:
          setFocusedCard(undefined)
          break
      }
    },
    { enabled },
  )

  const value = useMemo(() => ({ focusedCard, setFocusedCard: setEnabledFocusedCard }), [focusedCard, setEnabledFocusedCard])

  return <CardFocusContext value={value}>{children}</CardFocusContext>
}
