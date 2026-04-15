import { useId, useMemo, type RefObject } from 'react'
import { useElementAnchorPoints } from './useElementAnchorPoints'
import type { AnchorPoint, Point } from './useElementAnchorPoints'
import { computeGeometry, resolveBuilder } from './buildPath'
import type { OnboardingArrowPathBuilder, OnboardingArrowShape } from './buildPath'

const PADDING = 80

export interface OnboardingArrowProps {
  from: RefObject<Element | null>
  to: RefObject<Element | null>
  shape?: OnboardingArrowShape | OnboardingArrowPathBuilder
  fromAnchor?: AnchorPoint
  toAnchor?: AnchorPoint
  curvature?: number
  twist?: number
  roughness?: number
  bowing?: number
  seed?: number
  strokeWidth?: number
  color?: string
  className?: string
}

/**
 * Decorative SVG arrow that dynamically connects two DOM elements.
 * Renders as a `position: fixed` SVG overlay so it works regardless of
 * scroll position or container nesting. Updates on resize and scroll.
 *
 * Shape is configurable: pass a preset name (`arc`, `sCurve`, `lasso`,
 * `spiral`, `wave`) or a custom `OnboardingArrowPathBuilder` function.
 * Hand-drawn look comes from an SVG `feTurbulence` + `feDisplacementMap`
 * filter applied to the path — no external library needed.
 *
 * Figma: https://www.figma.com/design/zLXO12ISnORKAut0uduasj/Ligretto?node-id=1036-348
 */
export function OnboardingArrow({
  from,
  to,
  shape = 'arc',
  fromAnchor = 'center',
  toAnchor = 'center',
  curvature = 0.4,
  twist = 1,
  roughness = 1.8,
  bowing = 0.02,
  seed,
  strokeWidth = 2.5,
  color = 'white',
  className,
}: OnboardingArrowProps) {
  const uid = useId().replace(/:/g, '')
  const markerId = `onboarding-arrow-marker-${uid}`
  const filterId = `onboarding-arrow-sketch-${uid}`
  const points = useElementAnchorPoints(from, to, fromAnchor, toAnchor)

  const stableSeed = useMemo(() => {
    if (seed !== undefined) {return seed}
    let h = 0
    for (let i = 0; i < uid.length; i++) {h = (h * 31 + uid.charCodeAt(i)) | 0}
    return Math.abs(h) % 1000
  }, [seed, uid])

  if (!points) {
    return null
  }

  const { p1, p2 } = points

  const minX = Math.min(p1.x, p2.x) - PADDING
  const minY = Math.min(p1.y, p2.y) - PADDING
  const width = Math.abs(p2.x - p1.x) + PADDING * 2
  const height = Math.abs(p2.y - p1.y) + PADDING * 2

  const lp1: Point = { x: p1.x - minX, y: p1.y - minY }
  const lp2: Point = { x: p2.x - minX, y: p2.y - minY }

  const builder = resolveBuilder(shape)
  const geom = computeGeometry(lp1, lp2)
  const pathD = builder({ from: lp1, to: lp2, ...geom, curvature, twist })

  return (
    <svg
      className={className}
      style={{
        position: 'fixed',
        top: minY,
        left: minX,
        width,
        height,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 1000,
      }}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency={bowing} numOctaves={2} seed={stableSeed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={roughness * 4} />
        </filter>
        <marker id={markerId} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill={color} />
        </marker>
      </defs>
      <g filter={`url(#${filterId})`}>
        <path d={pathD} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
      </g>
    </svg>
  )
}
