import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { DescriptionBubble } from './DescriptionBubble'

interface PlaygroundDescriptionProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
}

export function PlaygroundDescription({ text, targetRef }: PlaygroundDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'left', 48)

  return (
    <>
      <DescriptionBubble
        ref={bubbleRef}
        text={text}
        position={position ? { left: position.left, top: position.top - 148, transform: position.transform } : null}
      />
      {position ? <OnboardingArrow fromAnchor="bottom" toAnchor="left" from={bubbleRef} to={targetRef} /> : null}
    </>
  )
}
