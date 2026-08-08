import { useEffect, useState, type RefObject } from 'react'

import { useOnboardingContainerRef } from '../targets'

/** Gap the side-anchored bubbles keep between themselves and the playground. */
const SIDE_OFFSET = 48
/** Below this the bubble would be capped into a tall narrow column — better to move it under the board. */
const MIN_SIDE_BUBBLE_WIDTH = 400

/**
 * Whether a description bubble still fits beside the playground.
 *
 * The desktop layout parks bubbles to the left and right of the playground, which only works while
 * the window is wide: the playground is centred, so the free strip beside it shrinks with the
 * window and by ~1400px it can no longer hold a readable bubble. Callers fall back to placing the
 * bubble under the board instead.
 *
 * @param playgroundRef - ref to the playground element
 *
 * @returns `false` until both elements are measured, so the safe layout is used first
 */
export function useHasRoomBesidePlayground(playgroundRef: RefObject<Element | null>): boolean {
  const containerRef = useOnboardingContainerRef()
  const [hasRoom, setHasRoom] = useState(false)

  useEffect(() => {
    function update() {
      const playgroundEl = playgroundRef.current
      const containerEl = containerRef.current
      if (!playgroundEl || !containerEl) {
        setHasRoom(false)
        return
      }
      const playgroundRect = playgroundEl.getBoundingClientRect()
      const containerRect = containerEl.getBoundingClientRect()
      const roomLeft = playgroundRect.left - containerRect.left
      const roomRight = containerRect.right - playgroundRect.right
      setHasRoom(Math.min(roomLeft, roomRight) - SIDE_OFFSET >= MIN_SIDE_BUBBLE_WIDTH)
    }

    update()

    const observer = new ResizeObserver(update)
    if (playgroundRef.current) {
      observer.observe(playgroundRef.current)
    }
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }
    window.addEventListener('resize', update)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [playgroundRef, containerRef])

  return hasRoom
}
