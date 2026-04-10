import { useId, type RefObject } from 'react'
import { useElementAnchorPoints } from './useElementAnchorPoints'
import type { AnchorPoint, Point } from './useElementAnchorPoints'

/** Extra space around the bounding box so strokes and arrowheads aren't clipped */
const PADDING = 40

export type OnboardingArrowVariant = 'arc' | 'loop'

export interface OnboardingArrowProps {
  /** Source element — the arrow starts here */
  from: RefObject<Element | null>
  /** Target element — the arrowhead lands here */
  to: RefObject<Element | null>
  /** 'arc' = wide horizontal curve; 'loop' = lasso-style vertical pointer */
  variant: OnboardingArrowVariant
  fromAnchor?: AnchorPoint
  toAnchor?: AnchorPoint
  /** Stroke and arrowhead color. Defaults to white. */
  color?: string
  className?: string
}

/**
 * Quadratic bezier arcing upward between two points.
 * Control point bows up ~40% of the chord length.
 * Matches Figma Vector 6 (arc, node 1077:741).
 *
 * Note: control-point scale (0.4) should be tuned visually against the Figma reference.
 */
function buildArcPath(lp1: Point, lp2: Point): string {
  const midX = (lp1.x + lp2.x) / 2
  const midY = (lp1.y + lp2.y) / 2
  const span = Math.hypot(lp2.x - lp1.x, lp2.y - lp1.y)
  // Always bow upward in screen space regardless of arrow direction
  return `M ${lp1.x} ${lp1.y} Q ${midX} ${midY - span * 0.4} ${lp2.x} ${lp2.y}`
}

/**
 * Cubic bezier that swings to one side before arriving at the target (lasso shape).
 * Control points are offset perpendicular to the travel direction.
 * Matches Figma Vector 5 (loop, node 1064:209).
 *
 * Note: loopRadius scale (0.18 × 1.8) should be tuned visually against the Figma reference.
 */
function buildLoopPath(lp1: Point, lp2: Point): string {
  const dx = lp2.x - lp1.x
  const dy = lp2.y - lp1.y
  const dist = Math.max(Math.hypot(dx, dy), 1)
  const swing = dist * 0.18 * 1.8

  // Perpendicular unit vector (left of travel direction)
  const perpX = (-dy / dist) * swing
  const perpY = (dx / dist) * swing

  const c1x = lp1.x + perpX + dx * 0.2
  const c1y = lp1.y + perpY + dy * 0.2
  const c2x = lp2.x + perpX * 0.6 - dx * 0.2
  const c2y = lp2.y + perpY * 0.6 - dy * 0.2

  return `M ${lp1.x} ${lp1.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${lp2.x} ${lp2.y}`
}

/**
 * Decorative SVG arrow that dynamically connects two DOM elements.
 * Renders as a `position: fixed` SVG overlay so it works regardless of
 * scroll position or container nesting. Updates on resize and scroll.
 *
 * Figma: https://www.figma.com/design/zLXO12ISnORKAut0uduasj/Ligretto?node-id=1036-348
 */
export function OnboardingArrow({ from, to, variant, fromAnchor = 'center', toAnchor = 'center', color = 'white', className }: OnboardingArrowProps) {
  const uid = useId().replace(/:/g, '')
  const markerId = `onboarding-arrow-marker-${uid}`
  const points = useElementAnchorPoints(from, to, fromAnchor, toAnchor)

  if (!points) {
    return null
  }

  const { p1, p2 } = points

  // Minimal bounding-box SVG viewport with padding so strokes aren't clipped
  const minX = Math.min(p1.x, p2.x) - PADDING
  const minY = Math.min(p1.y, p2.y) - PADDING
  const width = Math.abs(p2.x - p1.x) + PADDING * 2
  const height = Math.abs(p2.y - p1.y) + PADDING * 2

  // Translate anchor points into local SVG coordinate space
  const lp1: Point = { x: p1.x - minX, y: p1.y - minY }
  const lp2: Point = { x: p2.x - minX, y: p2.y - minY }

  const pathD = variant === 'arc' ? buildArcPath(lp1, lp2) : buildLoopPath(lp1, lp2)

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
        <marker id={markerId} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill={color} />
        </marker>
      </defs>
      <path d={pathD} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
    </svg>
  )
}
