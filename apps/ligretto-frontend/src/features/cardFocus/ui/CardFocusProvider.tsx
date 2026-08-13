import { useCallback, useEffect, useMemo, useState, type Dispatch, type PropsWithChildren, type SetStateAction } from 'react'

import { CardFocusContext, type CardFocusKey } from './CardFocusContext'

interface CardFocusProviderProps extends PropsWithChildren {
  enabled: boolean
}

export const CardFocusProvider = ({ children, enabled }: CardFocusProviderProps) => {
  const [focusedCard, setFocusedCard] = useState<CardFocusKey>()

  const setEnabledFocusedCard = useCallback<Dispatch<SetStateAction<CardFocusKey | undefined>>>(
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

  const value = useMemo(() => ({ focusedCard, setFocusedCard: setEnabledFocusedCard }), [focusedCard, setEnabledFocusedCard])

  return <CardFocusContext value={value}>{children}</CardFocusContext>
}
