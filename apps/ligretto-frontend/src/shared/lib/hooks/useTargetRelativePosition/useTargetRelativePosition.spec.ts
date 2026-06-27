import { describe, expect, it } from 'vitest'
import { computeTargetRelativePosition, type TargetRelativePlacement } from './useTargetRelativePosition'

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect

describe('computeTargetRelativePosition', () => {
  const container = rect(0, 0, 1000, 800)
  const target = rect(100, 200, 40, 60)
  const offset = 10

  it.each<{ placement: TargetRelativePlacement; expected: { left: number; top: number; transform: string } }>([
    { placement: 'top', expected: { left: 120, top: 190, transform: 'translate(-50%, -100%)' } },
    { placement: 'bottom', expected: { left: 120, top: 270, transform: 'translate(-50%, 0)' } },
    { placement: 'left', expected: { left: 90, top: 230, transform: 'translate(-100%, -50%)' } },
    { placement: 'right', expected: { left: 150, top: 230, transform: 'translate(0, -50%)' } },
  ])('positions to the $placement of the target', ({ placement, expected }) => {
    expect(computeTargetRelativePosition(target, container, placement, offset)).toEqual(expected)
  })

  it('expresses coordinates relative to the container origin', () => {
    const shiftedContainer = rect(50, 30, 1000, 800)

    expect(computeTargetRelativePosition(target, shiftedContainer, 'top', offset)).toEqual({
      left: 70,
      top: 160,
      transform: 'translate(-50%, -100%)',
    })
  })

  it('applies the offset away from the target side', () => {
    expect(computeTargetRelativePosition(target, container, 'bottom', 0).top).toBe(260)
    expect(computeTargetRelativePosition(target, container, 'bottom', 25).top).toBe(285)
  })
})
