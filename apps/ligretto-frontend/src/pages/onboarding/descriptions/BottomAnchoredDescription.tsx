import { useRef, type RefObject } from 'react'
import { useMediaQuery, useTheme } from '@memebattle/ui'

import { OnboardingArrow, dropPath } from '#shared/ui/OnboardingArrow'
import { useTargetRelativeRect } from '#shared/lib/hooks/useTargetRelativeRect'

import { useOnboardingCardsPanelRef, useOnboardingContainerRef } from '../targets'
import { DescriptionBubble } from './DescriptionBubble'

/** Gap between the cards panel and the bubble above it. */
const PHONE_OFFSET = 80
const TABLET_OFFSET = 72
/**
 * Which side the arrow bows to: negative bends it left of the target. Kept small so the arrow
 * still comes down onto the target rather than sweeping in sideways.
 */
const ARROW_TWIST = -0.4
const SIDE_ARROW_TWIST = { left: 1, right: -1 } as const

interface BottomAnchoredDescriptionProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
  /** Set for targets on the board rather than in the player's panel, i.e. above the bubble. */
  isTargetAbove?: boolean
  wideArrowFrom?: 'left' | 'right'
}

/**
 * Narrow-screen variant shared by every description except the playground one.
 *
 * The board is laid out in a single column — opponents on top, then the playground, then the
 * player's cards — so there is no room beside a target. The bubble goes into
 * the gap just above the player's cards and the arrow reaches out to whatever the step talks about.
 */
export function BottomAnchoredDescription({ text, targetRef, isTargetAbove = false, wideArrowFrom }: BottomAnchoredDescriptionProps) {
  const theme = useTheme()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'))
  const containerRef = useOnboardingContainerRef()
  const cardsPanelRef = useOnboardingCardsPanelRef()

  const panelRect = useTargetRelativeRect(cardsPanelRef, containerRef)
  const sideFrom = isPhone || isTargetAbove ? undefined : wideArrowFrom
  const position = panelRect ? { top: panelRect.top - (isPhone ? PHONE_OFFSET : TABLET_OFFSET), transform: 'translate(0, -100%)' } : null

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {/* Spelled out rather than auto-detected: the bubble always sits above the player's cards, so
          the arrow has to land on their top edge even when the target is off to one side. */}
      {position ? (
        <OnboardingArrow
          path={isPhone || sideFrom || isTargetAbove ? undefined : dropPath}
          twist={sideFrom ? SIDE_ARROW_TWIST[sideFrom] : ARROW_TWIST}
          fromAnchor={isTargetAbove ? 'top' : (sideFrom ?? 'bottom')}
          toAnchor={isTargetAbove ? 'bottom' : 'top'}
          toGap={8}
          from={bubbleRef}
          to={targetRef}
        />
      ) : null}
    </>
  )
}
