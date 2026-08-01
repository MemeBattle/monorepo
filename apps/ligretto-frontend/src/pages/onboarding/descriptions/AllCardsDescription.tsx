import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useIsNarrowLayout } from '../useIsNarrowLayout'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { BottomAnchoredDescription } from './BottomAnchoredDescription'
import { DescriptionBubble } from './DescriptionBubble'

interface AllCardsDescriptionProps {
  text: string
  playerRowRef: RefObject<HTMLElement | null>
}

function AllCardsDescriptionRelative({ text, playerRowRef }: AllCardsDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(playerRowRef, containerRef, 'top', 160)

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {position ? <OnboardingArrow fromAnchor="bottom" toAnchor="top" from={bubbleRef} to={playerRowRef} /> : null}
    </>
  )
}

export function AllCardsDescription({ text, playerRowRef }: AllCardsDescriptionProps) {
  const isNarrow = useIsNarrowLayout()

  return isNarrow ? (
    <BottomAnchoredDescription text={text} targetRef={playerRowRef} />
  ) : (
    <AllCardsDescriptionRelative text={text} playerRowRef={playerRowRef} />
  )
}
