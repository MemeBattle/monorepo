import { useId, useMemo, useRef, type RefObject } from 'react'
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
  roughness?: number
  bowing?: number
  seed?: number
  strokeWidth?: number
  color?: string
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
 * Hand-drawn look comes from an SVG `feTurbulence` + `feDisplacementMap`
 * filter applied to the path.
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
  roughness = 1,
  bowing = 1,
  seed,
  strokeWidth = 2.5,
  color = 'white',
}: OnboardingArrowProps) {
  const uid = useId()
  const filterId = `onboarding-arrow-sketch-${uid}`
  const markerId = `onboarding-arrow-marker-${uid}`
  const containerRef = useRef<HTMLDivElement>(null)
  const points = useElementAnchorPoints(from, to, containerRef, fromAnchor, toAnchor)

  const stableSeed = useMemo(() => {
    if (seed !== undefined) {return seed}
    let h = 0
    for (let i = 0; i < uid.length; i++) {h = (h * 31 + uid.charCodeAt(i)) | 0}
    return Math.abs(h) % 1000
  }, [seed, uid])

  return (
    <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {points &&
        (() => {
          const { p1, p2 } = points
          const minX = Math.min(p1.x, p2.x) - PADDING
          const minY = Math.min(p1.y, p2.y) - PADDING
          const width = Math.abs(p2.x - p1.x) + PADDING * 2
          const height = Math.abs(p2.y - p1.y) + PADDING * 2
          const lp1: Point = { x: p1.x - minX, y: p1.y - minY }
          const lp2: Point = { x: p2.x - minX, y: p2.y - minY }
          const geom = computeGeometry(lp1, lp2)
          const pathD = path({ from: lp1, to: lp2, ...geom, curvature, twist })
          return (
            <svg
              style={{ position: 'absolute', top: minY, left: minX, width, height, overflow: 'visible' }}
              viewBox={`0 0 ${width} ${height}`}
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
                  <feTurbulence type="fractalNoise" baseFrequency={bowing * 0.02} numOctaves={2} seed={stableSeed} result="noise" />
                  <feDisplacementMap in="SourceGraphic" in2="noise" scale={roughness * 6} />
                </filter>
                <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
                  <polyline
                    points="0,0 5,3 0,6"
                    stroke={color}
                    strokeWidth={1.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>
              </defs>
              <g filter={`url(#${filterId})`}>
                <path d={pathD} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
              </g>
            </svg>
          )
        })()}
    </div>
  )
}
