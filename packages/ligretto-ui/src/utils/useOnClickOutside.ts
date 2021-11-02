import type { RefObject } from 'react'
import { useEffect } from 'react'

type AnyEvent = MouseEvent | TouchEvent

export function useOnClickOutside<T extends HTMLElement = HTMLElement>(ref: RefObject<T>, handler?: (event: AnyEvent) => void): void {
  useEffect(() => {
    const listener = (event: AnyEvent) => {
      const el = ref?.current

      // Do nothing if clicking ref's element or descendent elements
      if (!el || el.contains(event.target as Node)) {
        return
      }

      handler?.(event)
    }

    document.addEventListener('click', listener)

    return () => {
      document.removeEventListener('click', listener)
    }

    // Reload only if ref or handler changes
  }, [ref, handler])
}
