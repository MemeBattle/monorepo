import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { DescriptionBubble } from './DescriptionBubble'

interface AllCardsDescriptionProps {
  text: string
  playerRowRef: RefObject<HTMLElement | null>
}

export function AllCardsDescription({ text, playerRowRef }: AllCardsDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(playerRowRef, containerRef, 'top', 160)

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {position ? <OnboardingArrow from={bubbleRef} to={playerRowRef} /> : null}
    </>
  )
}
