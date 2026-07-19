import { useRef, type RefObject } from 'react'

import { OnboardingArrow, sCurvePath } from '#shared/ui/OnboardingArrow'

import { DescriptionBubble } from './DescriptionBubble'

interface OpponentsDescriptionProps {
  text: string
  opponent0Ref: RefObject<HTMLElement | null>
  opponent1Ref: RefObject<HTMLElement | null>
  opponent2Ref: RefObject<HTMLElement | null>
}

export function OpponentsDescription({ text, opponent0Ref, opponent1Ref, opponent2Ref }: OpponentsDescriptionProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position="centered" />
      <OnboardingArrow path={sCurvePath} from={bubbleRef} to={opponent0Ref} />
      <OnboardingArrow fromGap={16} from={bubbleRef} to={opponent1Ref} />
      <OnboardingArrow twist={-1} from={bubbleRef} to={opponent2Ref} />
    </>
  )
}
