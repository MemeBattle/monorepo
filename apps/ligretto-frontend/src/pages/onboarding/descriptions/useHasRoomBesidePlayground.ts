import type { RefObject } from 'react'

import { useTargetRelativeRect } from '#shared/lib/hooks/useTargetRelativeRect'

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
  const playgroundRect = useTargetRelativeRect(playgroundRef, containerRef)
  const containerRect = useTargetRelativeRect(containerRef, containerRef)

  if (!playgroundRect || !containerRect) {
    return false
  }

  const roomLeft = playgroundRect.left
  const roomRight = containerRect.width - (playgroundRect.left + playgroundRect.width)

  return Math.min(roomLeft, roomRight) - SIDE_OFFSET >= MIN_SIDE_BUBBLE_WIDTH
}
