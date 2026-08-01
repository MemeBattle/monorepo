import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useIsNarrowLayout } from '../useIsNarrowLayout'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { BottomAnchoredDescription } from './BottomAnchoredDescription'
import { DescriptionBubble } from './DescriptionBubble'

interface OpponentMoveDescriptionProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
}

function OpponentMoveDescriptionRelative({ text, targetRef }: OpponentMoveDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'top', 24)

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {position ? <OnboardingArrow fromAnchor="bottom" toAnchor="top" from={bubbleRef} to={targetRef} /> : null}
    </>
  )
}

export function OpponentMoveDescription({ text, targetRef }: OpponentMoveDescriptionProps) {
  const isNarrow = useIsNarrowLayout()

  return isNarrow ? (
    // The opponent's card lands on the board, above the hint.
    <BottomAnchoredDescription text={text} targetRef={targetRef} isTargetAbove />
  ) : (
    <OpponentMoveDescriptionRelative text={text} targetRef={targetRef} />
  )
}
