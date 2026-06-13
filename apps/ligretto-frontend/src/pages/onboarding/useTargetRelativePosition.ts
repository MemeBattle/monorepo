import { useEffect, useState, type RefObject } from 'react'

export type TargetRelativePlacement = 'top' | 'bottom' | 'left' | 'right'

export interface RelativePosition {
  left: number
  top: number
  transform: string
}

function compute(targetRect: DOMRect, containerRect: DOMRect, placement: TargetRelativePlacement, offset: number): RelativePosition {
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
      setPosition(compute(targetEl.getBoundingClientRect(), containerEl.getBoundingClientRect(), placement, offset))
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
