import { useState, useEffect, type RefObject } from 'react'

export type AnchorPoint = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface Point {
  x: number
  y: number
}

export interface AnchorPoints {
  p1: Point
  p2: Point
}

function getAnchor(rect: DOMRect, anchor: AnchorPoint): Point {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  switch (anchor) {
    case 'top':
      return { x: cx, y: rect.top }
    case 'bottom':
      return { x: cx, y: rect.bottom }
    case 'left':
      return { x: rect.left, y: cy }
    case 'right':
      return { x: rect.right, y: cy }
    case 'center':
      return { x: cx, y: cy }
  }
}

/**
 * Tracks the viewport-relative anchor points of two DOM elements.
 * Returns null until both refs are attached.
 * Updates on element resize, window resize, and scroll.
 */
export function useElementAnchorPoints(
  from: RefObject<Element | null>,
  to: RefObject<Element | null>,
  fromAnchor: AnchorPoint = 'center',
  toAnchor: AnchorPoint = 'center',
): AnchorPoints | null {
  const [points, setPoints] = useState<AnchorPoints | null>(null)

  useEffect(() => {
    function update() {
      const fromEl = from.current
      const toEl = to.current
      if (!fromEl || !toEl) {
        setPoints(null)
        return
      }
      setPoints({
        p1: getAnchor(fromEl.getBoundingClientRect(), fromAnchor),
        p2: getAnchor(toEl.getBoundingClientRect(), toAnchor),
      })
    }

    update()

    const observer = new ResizeObserver(update)
    if (from.current) {
      observer.observe(from.current)
    }
    if (to.current) {
      observer.observe(to.current)
    }
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, { passive: true, capture: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, { capture: true })
    }
  }, [from, to, fromAnchor, toAnchor])

  return points
}
