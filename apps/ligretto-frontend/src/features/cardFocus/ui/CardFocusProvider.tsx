import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'

import { CardFocusContext, getCardFocusKey, isSameCardFocusTarget, type CardFocusOptions, type CardFocusRegistration } from './CardFocusContext'

interface CardFocusProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardFocusProvider = ({ children, enabled }: CardFocusProviderProps) => {
  const [focusedCard, setFocusedCard] = useState<CardFocusOptions>()
  const registrations = useRef(new Map<string, CardFocusRegistration>())

  const clearFocus = useCallback(() => setFocusedCard(undefined), [])

  const registerCard = useCallback((target: CardFocusOptions, registration: CardFocusRegistration) => {
    const key = getCardFocusKey(target)
    registrations.current.set(key, registration)

    return () => {
      if (registrations.current.get(key) !== registration) {
        return
      }
      registrations.current.delete(key)
      setFocusedCard(current => (current && getCardFocusKey(current) === key ? undefined : current))
    }
  }, [])

  const toggleFocus = useCallback(
    (target: CardFocusOptions) => {
      const registration = registrations.current.get(getCardFocusKey(target))
      if (!registration) {
        clearFocus()
        return
      }
      if (!registration.canFocus) {
        clearFocus()
        registration.onActivate?.()
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
