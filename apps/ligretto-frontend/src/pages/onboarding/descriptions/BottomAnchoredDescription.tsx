import { useRef, type RefObject } from 'react'
import { useMediaQuery, useTheme } from '@memebattle/ui'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { DescriptionBubble } from './DescriptionBubble'
import { useAboveCardsPanelPosition } from './useAboveCardsPanelPosition'

/** Gap between the cards panel and the bubble above it. */
const PHONE_OFFSET = 64
/** Between `sm` and `md` the board already fills the screen and the gap above the panel is thin. */
const TABLET_OFFSET = 24

interface BottomAnchoredDescriptionProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
  /**
   * Which side the arrow bows to: negative bends it left of the target, positive right. Kept small
   * so the arrow still comes down onto the target rather than sweeping in sideways.
   */
  twist?: number
  /** Set for targets on the board rather than in the player's panel, i.e. above the bubble. */
  isTargetAbove?: boolean
}

/**
 * Narrow-screen variant shared by every description.
 *
 * The board is laid out in a single column — opponents on top, then the playground, then the
 * player's cards pinned to the bottom — so there is no room beside a target. The bubble goes into
 * the gap just above the player's cards and the arrow reaches out to whatever the step talks about.
 */
export function BottomAnchoredDescription({ text, targetRef, twist = -0.4, isTargetAbove = false }: BottomAnchoredDescriptionProps) {
  const theme = useTheme()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'))
  const position = useAboveCardsPanelPosition(isPhone ? PHONE_OFFSET : TABLET_OFFSET)

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {/* Spelled out rather than auto-detected: the bubble always sits above the player's cards, so
          the arrow has to land on their top edge even when the target is off to one side. */}
      {position ? (
        <OnboardingArrow
          twist={twist}
          fromAnchor={isTargetAbove ? 'top' : 'bottom'}
          toAnchor={isTargetAbove ? 'bottom' : 'top'}
          toGap={8}
          from={bubbleRef}
          to={targetRef}
        />
      ) : null}
    </>
  )
}
