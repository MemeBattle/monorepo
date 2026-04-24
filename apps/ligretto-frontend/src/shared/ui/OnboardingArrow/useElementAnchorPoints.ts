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

const EDGE_ANCHORS: AnchorPoint[] = ['top', 'bottom', 'left', 'right']

function pickClosestEdgeAnchor(mine: DOMRect, other: DOMRect): AnchorPoint {
  const otherCX = other.left + other.width / 2
  const otherCY = other.top + other.height / 2
  let best: AnchorPoint = 'center'
  let bestDist = Infinity
  for (const anchor of EDGE_ANCHORS) {
    const p = getAnchor(mine, anchor)
    const d = Math.hypot(p.x - otherCX, p.y - otherCY)
    if (d < bestDist) {
      bestDist = d
      best = anchor
    }
  }
  return best
}

/**
 * Tracks the anchor points of two DOM elements relative to `container`'s
 * top-left. Returns null until all refs are attached.
 *
 * When `fromAnchor` / `toAnchor` are undefined, each side auto-picks the
 * edge center closest to the other element — producing the shortest visual
 * connection.
 *
 * Updates on element or container resize. No scroll listener is needed
 * because the consumer positions the arrow absolutely inside `container`.
 */
export function useElementAnchorPoints(
  from: RefObject<Element | null>,
  to: RefObject<Element | null>,
  container: RefObject<Element | null>,
  fromAnchor?: AnchorPoint,
  toAnchor?: AnchorPoint,
): AnchorPoints | null {
  const [points, setPoints] = useState<AnchorPoints | null>(null)

  useEffect(() => {
    function update() {
      const fromEl = from.current
      const toEl = to.current
      const containerEl = container.current
      if (!fromEl || !toEl || !containerEl) {
        setPoints(null)
        return
      }
      const fromRect = fromEl.getBoundingClientRect()
      const toRect = toEl.getBoundingClientRect()
      const containerRect = containerEl.getBoundingClientRect()
      const resolvedFrom = fromAnchor ?? pickClosestEdgeAnchor(fromRect, toRect)
      const resolvedTo = toAnchor ?? pickClosestEdgeAnchor(toRect, fromRect)
      const p1 = getAnchor(fromRect, resolvedFrom)
      const p2 = getAnchor(toRect, resolvedTo)
      setPoints({
        p1: { x: p1.x - containerRect.left, y: p1.y - containerRect.top },
        p2: { x: p2.x - containerRect.left, y: p2.y - containerRect.top },
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
    if (container.current) {
      observer.observe(container.current)
    }
    window.addEventListener('resize', update)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [from, to, container, fromAnchor, toAnchor])

  return points
}
