import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'

import { CardFocusContext, getCardFocusKey, isSameCardFocusTarget, type CardFocusOptions } from './CardFocusContext'

interface CardFocusProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardFocusProvider = ({ children, enabled }: CardFocusProviderProps) => {
  const [focusedCard, setFocusedCard] = useState<CardFocusOptions>()
  const registrations = useRef(new Set<string>())

  const clearFocus = useCallback(() => setFocusedCard(undefined), [])

  const registerCard = useCallback((target: CardFocusOptions) => {
    const key = getCardFocusKey(target)
    registrations.current.add(key)

    return () => {
      registrations.current.delete(key)
      setFocusedCard(current => (current && getCardFocusKey(current) === key ? undefined : current))
    }
  }, [])

  const toggleFocus = useCallback(
    (target: CardFocusOptions) => {
      if (!registrations.current.has(getCardFocusKey(target))) {
        clearFocus()
        return
      }
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

  const value = useMemo(() => ({ focusedCard, clearFocus, registerCard, toggleFocus }), [clearFocus, focusedCard, registerCard, toggleFocus])

  return <CardFocusContext value={value}>{children}</CardFocusContext>
}
