import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useIsNarrowLayout } from '../useIsNarrowLayout'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { BottomAnchoredDescription } from './BottomAnchoredDescription'
import { DescriptionBubble } from './DescriptionBubble'
import { useHasRoomBesidePlayground } from './useHasRoomBesidePlayground'

interface StackDescriptionVariantProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
}

function StackDescriptionRelative({ text, targetRef }: StackDescriptionVariantProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'top', 96)

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {position ? <OnboardingArrow fromAnchor="bottom" toAnchor="top" from={bubbleRef} to={targetRef} /> : null}
    </>
  )
}

interface StackDescriptionPlaygroundAnchoredProps extends StackDescriptionVariantProps {
  playgroundRef: RefObject<HTMLElement | null>
}

function StackDescriptionPlaygroundAnchored({ text, targetRef, playgroundRef }: StackDescriptionPlaygroundAnchoredProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  // Horizontal anchor — left side of the playground; vertical anchor — top of the stack deck.
  const playgroundPosition = useTargetRelativePosition(playgroundRef, containerRef, 'left', 48)
  const stackPosition = useTargetRelativePosition(targetRef, containerRef, 'top', 84)
  const position =
    playgroundPosition && stackPosition
      ? { left: playgroundPosition.left, top: stackPosition.top, transform: 'translate(-100%, -50%)', align: 'end' as const }
      : null

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} maxWidth="28rem" />
      {position ? <OnboardingArrow twist={-1} from={bubbleRef} toAnchor="top" fromGap={0} toGap={8} to={targetRef} /> : null}
    </>
  )
}

interface StackDescriptionProps extends StackDescriptionVariantProps {
  playgroundRef: RefObject<HTMLElement | null>
  isPlaygroundAnchored?: boolean
}

export function StackDescription({ text, targetRef, playgroundRef, isPlaygroundAnchored }: StackDescriptionProps) {
  const isNarrow = useIsNarrowLayout()
  const hasRoomBeside = useHasRoomBesidePlayground(playgroundRef)

  if (isPlaygroundAnchored) {
    return hasRoomBeside ? (
      <StackDescriptionPlaygroundAnchored text={text} targetRef={targetRef} playgroundRef={playgroundRef} />
    ) : (
      <BottomAnchoredDescription text={text} targetRef={targetRef} />
    )
  }

  return isNarrow ? <BottomAnchoredDescription text={text} targetRef={targetRef} /> : <StackDescriptionRelative text={text} targetRef={targetRef} />
}
