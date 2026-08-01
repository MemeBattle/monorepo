import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'

import { useOnboardingCardsPanelRef, useOnboardingContainerRef } from '../targets'
import type { BubblePosition } from './DescriptionBubble'

/**
 * Place a description bubble in the gap right above the player's cards panel.
 *
 * On a narrow screen the board is a single column — opponents, playground, then the panel pinned
 * to the bottom — and this gap is the only free space left. Only the vertical anchor comes from
 * the measurement: the bubble centres itself horizontally in the container (see `BubblePosition`)
 * so that a long text is not squeezed by shrink-to-fit.
 *
 * @param offset - gap, in pixels, between the panel and the bottom of the bubble
 *
 * @returns the bubble position, or `null` while the panel has not been measured
 */
export function useAboveCardsPanelPosition(offset: number): BubblePosition | null {
  const containerRef = useOnboardingContainerRef()
  const cardsPanelRef = useOnboardingCardsPanelRef()
  const position = useTargetRelativePosition(cardsPanelRef, containerRef, 'top', offset)

  return position ? { top: position.top, transform: 'translate(0, -100%)' } : null
}
