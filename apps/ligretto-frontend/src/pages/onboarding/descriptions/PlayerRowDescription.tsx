import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { DescriptionBubble } from './DescriptionBubble'

interface PlayerRowDescriptionProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
}

export function PlayerRowDescription({ text, targetRef }: PlayerRowDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'top', 124)

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {position ? <OnboardingArrow from={bubbleRef} to={targetRef} twist={0.1} /> : null}
    </>
  )
}
