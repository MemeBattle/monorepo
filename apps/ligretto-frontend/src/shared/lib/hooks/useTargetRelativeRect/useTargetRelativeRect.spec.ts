import { describe, expect, it } from 'vitest'
import { computeTargetRelativeRect } from './useTargetRelativeRect'

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

describe('computeTargetRelativeRect', () => {
  const container = rect(0, 0, 1000, 800)
  const target = rect(100, 200, 40, 60)

  it('returns the target rect as is without padding', () => {
    expect(computeTargetRelativeRect(target, container)).toEqual({ left: 100, top: 200, width: 40, height: 60 })
  })

  it('inflates the rect by the padding on every side', () => {
    expect(computeTargetRelativeRect(target, container, 10)).toEqual({ left: 90, top: 190, width: 60, height: 80 })
  })

  it('expresses coordinates relative to the container origin', () => {
    const shiftedContainer = rect(50, 30, 1000, 800)

    expect(computeTargetRelativeRect(target, shiftedContainer, 10)).toEqual({ left: 40, top: 160, width: 60, height: 80 })
  })

  describe('clamped to the container', () => {
    it('keeps a rect that already fits untouched', () => {
      expect(computeTargetRelativeRect(target, container, 10, true)).toEqual({ left: 90, top: 190, width: 60, height: 80 })
    })

    it('cuts the padding that sticks out past the container edges', () => {
      const cornerTarget = rect(5, 760, 40, 35)

      expect(computeTargetRelativeRect(cornerTarget, container, 20, true)).toEqual({ left: 0, top: 740, width: 65, height: 60 })
    })

    it('collapses to an empty rect when the target lies outside the container', () => {
      const outsideTarget = rect(1100, 200, 40, 60)

      expect(computeTargetRelativeRect(outsideTarget, container, 10, true)).toEqual({ left: 1000, top: 190, width: 0, height: 80 })
    })
  })
})
