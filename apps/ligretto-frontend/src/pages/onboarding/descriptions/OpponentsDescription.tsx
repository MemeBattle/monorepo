import { useRef, type RefObject } from 'react'

import { OnboardingArrow, sCurvePath } from '#shared/ui/OnboardingArrow'

import { useIsNarrowLayout } from '../useIsNarrowLayout'
import { DescriptionBubble } from './DescriptionBubble'

interface OpponentsDescriptionProps {
  text: string
  opponent0Ref: RefObject<HTMLElement | null>
  opponent1Ref: RefObject<HTMLElement | null>
  opponent2Ref: RefObject<HTMLElement | null>
}

export function OpponentsDescription({ text, opponent0Ref, opponent1Ref, opponent2Ref }: OpponentsDescriptionProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const isNarrow = useIsNarrowLayout()

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position="centered" />
      {isNarrow ? (
        // The opponents are stacked in a column right above the bubble, so the arrows
        // leave its left edge and bend further left to reach them without crossing the cards.
        <>
          <OnboardingArrow curvature={0.7} twist={-0.6} fromAnchor="left" toAnchor="left" fromGap={8} from={bubbleRef} to={opponent0Ref} />
          <OnboardingArrow curvature={0.7} twist={-0.42} fromAnchor="left" toAnchor="left" fromGap={8} from={bubbleRef} to={opponent1Ref} />
          <OnboardingArrow curvature={0.7} twist={-0.28} fromAnchor="left" toAnchor="left" fromGap={8} from={bubbleRef} to={opponent2Ref} />
        </>
      ) : (
        <>
          <OnboardingArrow path={sCurvePath} from={bubbleRef} to={opponent0Ref} />
          <OnboardingArrow fromGap={16} from={bubbleRef} to={opponent1Ref} />
          <OnboardingArrow twist={-1} from={bubbleRef} to={opponent2Ref} />
        </>
      )}
    </>
  )
}
