import { useEffect, useState, type RefObject } from 'react'

/** Position and size of an element expressed in a container's coordinate system. */
export interface RelativeRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Compute the rect of a target element in the container's coordinate system,
 * inflated by `padding` on every side.
 *
 * The result is DOM-agnostic: it only reads the geometry of the provided rects,
 * which makes it straightforward to unit-test.
 *
 * @param targetRect - bounding rect of the element to cover
 * @param containerRect - bounding rect of the positioning context (offset parent)
 * @param padding - how far, in pixels, the rect extends beyond the target on every side
 * @param isClampedToContainer - cut the padded rect down to the container's box, so that
 *   a target sitting near an edge does not push the rect out of sight
 *
 * @returns `left`/`top` offsets within the container and the inflated size
 */
export function computeTargetRelativeRect(targetRect: DOMRect, containerRect: DOMRect, padding = 0, isClampedToContainer = false): RelativeRect {
  const left = targetRect.left - containerRect.left - padding
  const top = targetRect.top - containerRect.top - padding
  const width = targetRect.width + padding * 2
  const height = targetRect.height + padding * 2

  if (!isClampedToContainer) {
    return { left, top, width, height }
  }

  const clampedLeft = Math.min(Math.max(left, 0), containerRect.width)
  const clampedTop = Math.min(Math.max(top, 0), containerRect.height)

  return {
    left: clampedLeft,
    top: clampedTop,
    width: Math.max(Math.min(left + width, containerRect.width) - clampedLeft, 0),
    height: Math.max(Math.min(top + height, containerRect.height) - clampedTop, 0),
  }
}

/**
 * Track the rect of a target element in the coordinate system of a container.
 *
 * Recomputes on mount and whenever the target or container is resized (via a
 * `ResizeObserver`) or the window is resized. Returns `null` while the target is
 * absent or either element has not been measured yet.
 *
 * @param target - ref to the element to cover; `null`/`undefined` disables tracking
 * @param container - ref to the positioning context (offset parent)
 * @param padding - how far, in pixels, the rect extends beyond the target on every side
 * @param isClampedToContainer - keep the padded rect inside the container's box
 *
 * @returns the current {@link RelativeRect}, or `null` when it cannot be computed
 */
export function useTargetRelativeRect(
  target: RefObject<Element | null> | null | undefined,
  container: RefObject<Element | null>,
  padding = 0,
  isClampedToContainer = false,
): RelativeRect | null {
  const [rect, setRect] = useState<RelativeRect | null>(null)

  useEffect(() => {
    if (!target) {
      setRect(null)
      return
    }

    function update() {
      const targetEl = target?.current
      const containerEl = container.current
      if (!targetEl || !containerEl) {
        setRect(null)
        return
      }
      setRect(computeTargetRelativeRect(targetEl.getBoundingClientRect(), containerEl.getBoundingClientRect(), padding, isClampedToContainer))
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
  }, [target, container, padding, isClampedToContainer])

  return rect
}
