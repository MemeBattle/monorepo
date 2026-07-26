import type { RefObject } from 'react'
import { Box } from '@memebattle/ui'

import { OnboardingOutline } from '#shared/ui/OnboardingOutline'
import { useTargetRelativeRect } from '#shared/lib/hooks/useTargetRelativeRect'

import { useOnboardingContainerRef } from './targets'

/** Gap between the wrapped element and the loop drawn around it. */
const DEFAULT_PADDING = 28

interface TargetOutlineProps {
  targetRef: RefObject<HTMLElement | null>
  padding?: number
}

/**
 * Draws the hand-drawn loop around a target element of the onboarding page.
 *
 * Positioned absolutely inside the page container (the same positioning context
 * the description bubbles use), above the dimming Overlay and the raised Layers.
 */
export function TargetOutline({ targetRef, padding = DEFAULT_PADDING }: TargetOutlineProps) {
  const containerRef = useOnboardingContainerRef()
  // Clamped: the player's cards sit right at the bottom of the page, so the padded
  // rect would otherwise put the bottom of the loop out of sight.
  const rect = useTargetRelativeRect(targetRef, containerRef, padding, true)

  if (!rect) {
    return null
  }

  return (
    <Box
      data-test-id="OnboardingPage-Outline"
      sx={{
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: 2,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    >
      <OnboardingOutline />
    </Box>
  )
}
