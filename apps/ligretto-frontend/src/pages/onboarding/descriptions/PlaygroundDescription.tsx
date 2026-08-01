import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useIsNarrowLayout } from '../useIsNarrowLayout'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { BottomAnchoredDescription } from './BottomAnchoredDescription'
import { DescriptionBubble } from './DescriptionBubble'
import { useHasRoomBesidePlayground } from './useHasRoomBesidePlayground'

interface PlaygroundDescriptionProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
}

function PlaygroundDescriptionSideAnchored({ text, targetRef }: PlaygroundDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'left', 48)

  return (
    <>
      <DescriptionBubble
        ref={bubbleRef}
        text={text}
        position={position ? { left: position.left, top: position.top - 148, transform: position.transform, align: 'end' } : null}
      />
      {position ? <OnboardingArrow fromAnchor="bottom" toAnchor="left" from={bubbleRef} to={targetRef} /> : null}
    </>
  )
}

function PlaygroundDescriptionAboveBoard({ text, targetRef }: PlaygroundDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'top', 44)
  // Centred in the container rather than on the playground, so the box can never run off an edge.
  const bubblePosition = position ? { top: position.top, transform: 'translate(0, -100%)' } : null

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={bubblePosition} />
      {bubblePosition ? <OnboardingArrow twist={-1} fromAnchor="bottom" toAnchor="top" toGap={8} from={bubbleRef} to={targetRef} /> : null}
    </>
  )
}

export function PlaygroundDescription({ text, targetRef }: PlaygroundDescriptionProps) {
  const isNarrow = useIsNarrowLayout()
  const hasRoomBeside = useHasRoomBesidePlayground(targetRef)

  if (hasRoomBeside) {
    return <PlaygroundDescriptionSideAnchored text={text} targetRef={targetRef} />
  }

  // In a single column the free strip is under the board; on the desktop grid the board is only a
  // few pixels above the cards panel, so the hint goes into the band above it instead.
  return isNarrow ? (
    <BottomAnchoredDescription text={text} targetRef={targetRef} isTargetAbove />
  ) : (
    <PlaygroundDescriptionAboveBoard text={text} targetRef={targetRef} />
  )
}
