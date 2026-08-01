import { useRef, type RefObject } from 'react'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useIsNarrowLayout } from '../useIsNarrowLayout'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'
import { BottomAnchoredDescription } from './BottomAnchoredDescription'
import { DescriptionBubble } from './DescriptionBubble'
import { useHasRoomBesidePlayground } from './useHasRoomBesidePlayground'

interface LigrettoDescriptionVariantProps {
  text: string
  targetRef: RefObject<HTMLElement | null>
}

function LigrettoDescriptionRelative({ text, targetRef }: LigrettoDescriptionVariantProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'top', 96)

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {position ? <OnboardingArrow fromAnchor="bottom" toAnchor="top" from={bubbleRef} twist={-0.7} to={targetRef} /> : null}
    </>
  )
}

interface LigrettoDescriptionTopAnchoredProps extends LigrettoDescriptionVariantProps {
  playgroundRef: RefObject<HTMLElement | null>
}

function LigrettoDescriptionTopAnchored({ text, targetRef, playgroundRef }: LigrettoDescriptionTopAnchoredProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  // Horizontal anchor — right side of the playground; vertical anchor — top of the ligretto deck.
  const playgroundPosition = useTargetRelativePosition(playgroundRef, containerRef, 'right', 48)
  const ligrettoPosition = useTargetRelativePosition(targetRef, containerRef, 'top', 84)
  const position =
    playgroundPosition && ligrettoPosition
      ? { left: playgroundPosition.left, top: ligrettoPosition.top, transform: 'translate(0, -50%)', align: 'start' as const }
      : null

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} maxWidth="28rem" />
      {position ? <OnboardingArrow twist={1} from={bubbleRef} toAnchor="top" toGap={8} to={targetRef} /> : null}
    </>
  )
}

interface LigrettoDescriptionProps extends LigrettoDescriptionVariantProps {
  playgroundRef: RefObject<HTMLElement | null>
  isPlaygroundAnchored?: boolean
}

export function LigrettoDescription({ text, targetRef, playgroundRef, isPlaygroundAnchored }: LigrettoDescriptionProps) {
  const isNarrow = useIsNarrowLayout()
  const hasRoomBeside = useHasRoomBesidePlayground(playgroundRef)

  if (isPlaygroundAnchored) {
    return hasRoomBeside ? (
      <LigrettoDescriptionTopAnchored text={text} targetRef={targetRef} playgroundRef={playgroundRef} />
    ) : (
      <BottomAnchoredDescription text={text} targetRef={targetRef} />
    )
  }

  if (isNarrow) {
    return <BottomAnchoredDescription text={text} targetRef={targetRef} />
  }

  return <LigrettoDescriptionRelative text={text} targetRef={targetRef} />
}
