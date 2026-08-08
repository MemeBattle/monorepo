import { useId, useRef, type RefObject } from 'react'
import { useElementAnchorPoints } from './useElementAnchorPoints'
import type { AnchorPoint, Point } from './useElementAnchorPoints'
import { arcPath, computeGeometry } from './buildPath'
import type { OnboardingArrowPathBuilder } from './buildPath'

const PADDING = 80

export interface OnboardingArrowProps {
  from: RefObject<Element | null>
  to: RefObject<Element | null>
  path?: OnboardingArrowPathBuilder
  fromAnchor?: AnchorPoint
  toAnchor?: AnchorPoint
  curvature?: number
  twist?: number
  strokeWidth?: number
  color?: string
  fromGap?: number
  toGap?: number
}

/**
 * Decorative SVG arrow that dynamically connects two DOM elements.
 *
 * Must be rendered inside a `position: relative` (or otherwise positioned)
 * container that also contains the `from` and `to` elements. The SVG is
 * absolutely positioned, so scroll doesn't require recalculation — the
 * arrow moves with the container.
 *
 * Shape is fully controlled by the `path` prop — any `OnboardingArrowPathBuilder`
 * function. Built-in presets (`arcPath`, `sCurvePath`, `lassoPath`,
 * `spiralPath`, `wavePath`) are exported alongside the component.
 *
 * Figma: https://www.figma.com/design/zLXO12ISnORKAut0uduasj/Ligretto?node-id=1036-348
 */
export function OnboardingArrow({
  from,
  to,
  path = arcPath,
  fromAnchor,
  toAnchor,
  curvature = 0.4,
  twist = 1,
  strokeWidth = 2.5,
  color = 'white',
  fromGap = 0,
  toGap = 8,
}: OnboardingArrowProps) {
  const uid = useId()
  const markerId = `onboarding-arrow-marker-${uid}`
  const containerRef = useRef<HTMLDivElement>(null)
  const points = useElementAnchorPoints(from, to, containerRef, fromAnchor, toAnchor)

  return (
    // zIndex matches the description bubble: an arrow is part of the same decoration and has to
    // stay above the raised game layers it points at. The svg is inflated by PADDING on every
    // side, so it is clipped to the container to keep it from growing the page.
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'hidden' }}>
      {points &&
        (() => {
          const { p1, p2 } = points
          const minX = Math.min(p1.x, p2.x) - PADDING
          const minY = Math.min(p1.y, p2.y) - PADDING
          const width = Math.abs(p2.x - p1.x) + PADDING * 2
          const height = Math.abs(p2.y - p1.y) + PADDING * 2
          const lp1: Point = { x: p1.x - minX, y: p1.y - minY }
          const lp2: Point = { x: p2.x - minX, y: p2.y - minY }
          const dx = lp2.x - lp1.x
          const dy = lp2.y - lp1.y
          const len = Math.hypot(dx, dy)
          let pFrom: Point = lp1
          let pTo: Point = lp2
          if (len > fromGap + toGap + 1) {
            const tx = dx / len
            const ty = dy / len
            pFrom = { x: lp1.x + tx * fromGap, y: lp1.y + ty * fromGap }
            pTo = { x: lp2.x - tx * toGap, y: lp2.y - ty * toGap }
          }
          const geom = computeGeometry(pFrom, pTo)
          const pathD = path({ from: pFrom, to: pTo, ...geom, curvature, twist })
          return (
            <svg
              style={{ position: 'absolute', top: minY, left: minX, width, height, overflow: 'visible' }}
              viewBox={`0 0 ${width} ${height}`}
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
                  <polyline points="0,0 5,3 0,6" stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>
              <path d={pathD} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
            </svg>
          )
        })()}
    </div>
  )
}
