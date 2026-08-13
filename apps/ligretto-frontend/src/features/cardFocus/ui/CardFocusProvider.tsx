import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

import { Hotkey } from '#ducks/game'
import { CardFocusContext, isSameCardFocusTarget, type CardFocusOptions } from './CardFocusContext'

interface CardFocusProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardFocusProvider = ({ children, enabled }: CardFocusProviderProps) => {
  const [focusedCard, setFocusedCard] = useState<CardFocusOptions>()

  const clearFocus = useCallback((target?: CardFocusOptions) => {
    setFocusedCard(current => (!target || isSameCardFocusTarget(current, target) ? undefined : current))
  }, [])

  const toggleFocus = useCallback(
    (target: CardFocusOptions) => {
      if (!enabled) {
        clearFocus()
        return
      }
      setFocusedCard(current => (isSameCardFocusTarget(current, target) ? undefined : target))
    },
    [clearFocus, enabled],
  )

  useEffect(() => {
    if (!enabled) {
      clearFocus()
    }
  }, [clearFocus, enabled])

  useHotkeys(
    Hotkey.escape,
    event => {
      event.preventDefault()
      clearFocus()
    },
    { enabled },
  )

  useEffect(() => {
    if (!focusedCard) {
      return
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-card-focus-element]')) {
        return
      }
      clearFocus()
    }

    document.addEventListener('click', handleDocumentClick)
    return () => document.removeEventListener('click', handleDocumentClick)
  }, [clearFocus, focusedCard])

  const value = useMemo(() => ({ focusedCard, clearFocus, toggleFocus }), [clearFocus, focusedCard, toggleFocus])

  return <CardFocusContext value={value}>{children}</CardFocusContext>
}
