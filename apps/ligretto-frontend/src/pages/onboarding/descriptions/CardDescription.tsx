import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { BottomAnchoredDescription } from './BottomAnchoredDescription'
import { DescriptionBubble } from './DescriptionBubble'
import { useHasRoomBesidePlayground } from './useHasRoomBesidePlayground'

interface CardDescriptionProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
  playgroundRef: RefObject<HTMLElement | null>
}

function CardDescriptionPlaygroundAnchored({ text, targetRef, playgroundRef }: CardDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  // Horizontal anchor — left side of the playground; vertical anchor — center of the highlighted card.
  const playgroundPosition = useTargetRelativePosition(playgroundRef, containerRef, 'left', 48)
  const cardPosition = useTargetRelativePosition(targetRef, containerRef, 'top', 84)
  const position =
    playgroundPosition && cardPosition
      ? { left: playgroundPosition.left, top: cardPosition.top, transform: 'translate(-100%, -50%)', align: 'end' as const }
      : null

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} maxWidth="28rem" />
      {position ? <OnboardingArrow twist={-1} from={bubbleRef} toAnchor="top" toGap={8} to={targetRef} /> : null}
    </>
  )
}

export function CardDescription({ text, targetRef, playgroundRef }: CardDescriptionProps) {
  const hasRoomBeside = useHasRoomBesidePlayground(playgroundRef)

  return hasRoomBeside ? (
    <CardDescriptionPlaygroundAnchored text={text} targetRef={targetRef} playgroundRef={playgroundRef} />
  ) : (
    <BottomAnchoredDescription text={text} targetRef={targetRef} />
  )
}
