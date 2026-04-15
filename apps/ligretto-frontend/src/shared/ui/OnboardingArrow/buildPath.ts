import type { Point } from './useElementAnchorPoints'

export interface PathBuilderArgs {
  from: Point
  to: Point
  chord: number
  normal: Point
  tangent: Point
  curvature: number
  twist: number
}

export type OnboardingArrowPathBuilder = (args: PathBuilderArgs) => string

export type OnboardingArrowShape = 'arc' | 'sCurve' | 'lasso' | 'spiral' | 'wave'

export const arcPath: OnboardingArrowPathBuilder = ({ from, to, chord, normal, curvature, twist }) => {
  const k = chord * curvature * twist
  const cx = (from.x + to.x) / 2 + normal.x * k
  const cy = (from.y + to.y) / 2 + normal.y * k
  return `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`
}

export const sCurvePath: OnboardingArrowPathBuilder = ({ from, to, chord, normal, tangent, curvature, twist }) => {
  const k = chord * curvature * twist
  const c1x = from.x + tangent.x * chord * 0.25 + normal.x * k
  const c1y = from.y + tangent.y * chord * 0.25 + normal.y * k
  const c2x = from.x + tangent.x * chord * 0.75 - normal.x * k
  const c2y = from.y + tangent.y * chord * 0.75 - normal.y * k
  return `M ${from.x} ${from.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${to.x} ${to.y}`
}

export const lassoPath: OnboardingArrowPathBuilder = ({ from, to, chord, normal, tangent, curvature, twist }) => {
  const swing = chord * curvature * 1.8 * twist
  const c1x = from.x + tangent.x * chord * 0.2 + normal.x * swing
  const c1y = from.y + tangent.y * chord * 0.2 + normal.y * swing
  const c2x = to.x - tangent.x * chord * 0.2 + normal.x * swing * 0.6
  const c2y = to.y - tangent.y * chord * 0.2 + normal.y * swing * 0.6
  return `M ${from.x} ${from.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${to.x} ${to.y}`
}

export const spiralPath: OnboardingArrowPathBuilder = ({ from, to, chord, normal, tangent, curvature, twist }) => {
  const turns = Math.max(0.5, Math.abs(twist))
  const radius = chord * curvature * 0.6
  const segments = Math.max(8, Math.round(turns * 16))
  const approachLen = chord * 0.6
  const approachX = from.x + tangent.x * approachLen
  const approachY = from.y + tangent.y * approachLen
  const direction = twist >= 0 ? 1 : -1
  let d = `M ${from.x} ${from.y} Q ${(from.x + approachX) / 2 + normal.x * chord * curvature * 0.4} ${
    (from.y + approachY) / 2 + normal.y * chord * curvature * 0.4
  } ${approachX} ${approachY}`
  const startAngle = Math.atan2(to.y - approachY, to.x - approachX)
  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const angle = startAngle + direction * t * turns * Math.PI * 2
    const r = radius * (1 - t * 0.85)
    const x = to.x + Math.cos(angle) * r - Math.cos(startAngle) * radius * (1 - 0)
    const y = to.y + Math.sin(angle) * r - Math.sin(startAngle) * radius * (1 - 0)
    d += ` L ${x} ${y}`
  }
  d += ` L ${to.x} ${to.y}`
  return d
}

export const wavePath: OnboardingArrowPathBuilder = ({ from, to, chord, normal, tangent, curvature, twist }) => {
  const inflections = Math.max(1, Math.round(Math.abs(twist) * 2))
  const amp = chord * curvature * 0.5
  const segments = inflections + 1
  let d = `M ${from.x} ${from.y}`
  let prevX = from.x
  let prevY = from.y
  for (let i = 1; i <= segments; i++) {
    const t = i / segments
    const baseX = from.x + tangent.x * chord * t
    const baseY = from.y + tangent.y * chord * t
    const sign = i % 2 === 0 ? -1 : 1
    const targetX = baseX + normal.x * amp * sign
    const targetY = baseY + normal.y * amp * sign
    const handleLen = chord / segments / 2
    const c1x = prevX + tangent.x * handleLen
    const c1y = prevY + tangent.y * handleLen
    const c2x = targetX - tangent.x * handleLen
    const c2y = targetY - tangent.y * handleLen
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${targetX} ${targetY}`
    prevX = targetX
    prevY = targetY
  }
  d += ` L ${to.x} ${to.y}`
  return d
}

export const presets: Record<OnboardingArrowShape, OnboardingArrowPathBuilder> = {
  arc: arcPath,
  sCurve: sCurvePath,
  lasso: lassoPath,
  spiral: spiralPath,
  wave: wavePath,
}

export function resolveBuilder(shape: OnboardingArrowShape | OnboardingArrowPathBuilder): OnboardingArrowPathBuilder {
  return typeof shape === 'function' ? shape : presets[shape]
}

export function computeGeometry(from: Point, to: Point): { chord: number; normal: Point; tangent: Point } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const chord = Math.max(Math.hypot(dx, dy), 1)
  const tangent: Point = { x: dx / chord, y: dy / chord }
  const normal: Point = { x: -tangent.y, y: tangent.x }
  return { chord, normal, tangent }
}
