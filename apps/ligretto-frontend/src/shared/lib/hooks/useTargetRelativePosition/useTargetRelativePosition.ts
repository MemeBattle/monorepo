import { useEffect, useState, type RefObject } from 'react'

/** Side of the target element the returned point should be anchored to. */
export type TargetRelativePlacement = 'top' | 'bottom' | 'left' | 'right'

/**
 * Absolute position (relative to the container) together with a CSS `transform`
 * that aligns the positioned element against the chosen side of the target.
 */
export interface RelativePosition {
  left: number
  top: number
  transform: string
}

/**
 * Compute the position of a floating element relative to a target, expressed in
 * the container's coordinate system.
 *
 * The result is DOM-agnostic: it only reads the geometry of the provided rects,
 * which makes it straightforward to unit-test.
 *
 * @param targetRect - bounding rect of the element to point at
 * @param containerRect - bounding rect of the positioning context (offset parent)
 * @param placement - side of the target to anchor against
 * @param offset - gap, in pixels, between the target's side and the element
 *
 * @returns `left`/`top` offsets within the container and the `transform` needed
 *   to align the element against the target
 */
export function computeTargetRelativePosition(
  targetRect: DOMRect,
  containerRect: DOMRect,
  placement: TargetRelativePlacement,
  offset: number,
): RelativePosition {
  const cx = targetRect.left + targetRect.width / 2 - containerRect.left
  const cy = targetRect.top + targetRect.height / 2 - containerRect.top
  const targetTop = targetRect.top - containerRect.top
  const targetBottom = targetRect.bottom - containerRect.top
  const targetLeft = targetRect.left - containerRect.left
  const targetRight = targetRect.right - containerRect.left

  switch (placement) {
    case 'top':
      return { left: cx, top: targetTop - offset, transform: 'translate(-50%, -100%)' }
    case 'bottom':
      return { left: cx, top: targetBottom + offset, transform: 'translate(-50%, 0)' }
    case 'left':
      return { left: targetLeft - offset, top: cy, transform: 'translate(-100%, -50%)' }
    case 'right':
      return { left: targetRight + offset, top: cy, transform: 'translate(0, -50%)' }
  }
}

/**
 * Track the position of a floating element relative to a target element, in the
 * coordinate system of a container.
 *
 * Recomputes on mount and whenever the target or container is resized (via a
 * `ResizeObserver`) or the window is resized. Returns `null` while the target is
 * absent or either element has not been measured yet.
 *
 * @param target - ref to the element to point at; `null`/`undefined` disables tracking
 * @param container - ref to the positioning context (offset parent)
 * @param placement - side of the target to anchor against
 * @param offset - gap, in pixels, between the target's side and the element
 *
 * @returns the current {@link RelativePosition}, or `null` when it cannot be computed
 */
export function useTargetRelativePosition(
  target: RefObject<Element | null> | null | undefined,
  container: RefObject<Element | null>,
  placement: TargetRelativePlacement,
  offset: number,
): RelativePosition | null {
  const [position, setPosition] = useState<RelativePosition | null>(null)

  useEffect(() => {
    if (!target) {
      setPosition(null)
      return
    }

    function update() {
      const targetEl = target?.current
      const containerEl = container.current
      if (!targetEl || !containerEl) {
        setPosition(null)
        return
      }
      setPosition(computeTargetRelativePosition(targetEl.getBoundingClientRect(), containerEl.getBoundingClientRect(), placement, offset))
    }

    update()

    const observer = new ResizeObserver(update)
    if (target.current) {
      observer.observe(target.current)
    }
    if (container.current) {
      observer.observe(container.current)
    }
    window.addEventListener('resize', update)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [target, container, placement, offset])

  return position
}
