import { useRef, type RefObject } from 'react'
import { useSelector } from 'react-redux'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingStep, onboardingStepSelector } from '#features/onboarding'
import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'

const TEXT_BY_STEP: Partial<Record<OnboardingStep, string>> = {
  [OnboardingStep.Stack]: 'Это твои карты в руке',
  [OnboardingStep.StackCard]: 'Если из ряда выложить нечего, воспользуйся колодой в руке',
  [OnboardingStep.StackUnavailableCard]:
    'Выкладывать на стол можно только карту того же цвета следующую по номиналу (или единицу на свободное место). Давай искать подходящую карту в руке дальше',
  [OnboardingStep.StackAvailableCard]: 'Скорее выкладывай карту на стол!',
}

const PLAYGROUND_ANCHORED_STEPS = new Set<OnboardingStep>([OnboardingStep.StackCard])

interface StackDescriptionProps {
  targetRef: RefObject<HTMLElement | null>
}

interface StackDescriptionPlaygroundAnchoredProps extends StackDescriptionProps {
  playgroundRef: RefObject<HTMLElement | null>
}

function StackDescriptionRelative({ targetRef }: StackDescriptionProps) {
  const step = useSelector(onboardingStepSelector)
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'top', 96)

  return (
    <>
      <Box
        ref={bubbleRef}
        sx={{
          position: 'absolute',
          maxWidth: 'min(32rem, calc(100vw - 32px))',
          px: 2,
          zIndex: 2,
          pointerEvents: 'none',
          ...(position
            ? { left: `${position.left}px`, top: `${position.top}px`, transform: position.transform, visibility: 'visible' }
            : { left: 0, top: 0, visibility: 'hidden' }),
        }}
      >
        <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold">
          {TEXT_BY_STEP[step]}
        </Typography>
      </Box>
      {position ? <OnboardingArrow from={bubbleRef} to={targetRef} /> : null}
    </>
  )
}

function StackDescriptionPlaygroundAnchored({ targetRef, playgroundRef }: StackDescriptionPlaygroundAnchoredProps) {
  const step = useSelector(onboardingStepSelector)
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  // Horizontal anchor — left side of the playground; vertical anchor — top of the stack deck.
  const playgroundPosition = useTargetRelativePosition(playgroundRef, containerRef, 'left', 48)
  const stackPosition = useTargetRelativePosition(targetRef, containerRef, 'top', 84)
  const position = playgroundPosition && stackPosition ? { left: playgroundPosition.left, top: stackPosition.top } : null

  return (
    <>
      <Box
        ref={bubbleRef}
        sx={{
          position: 'absolute',
          maxWidth: 'min(28rem, calc(100vw - 32px))',
          px: 0,
          zIndex: 2,
          pointerEvents: 'none',
          ...(position
            ? { left: `${position.left}px`, top: `${position.top}px`, transform: 'translate(-100%, -50%)', visibility: 'visible' }
            : { left: 0, top: 0, visibility: 'hidden' }),
        }}
      >
        <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold">
          {TEXT_BY_STEP[step]}
        </Typography>
      </Box>
      {position ? <OnboardingArrow twist={-1} from={bubbleRef} toAnchor="top" fromGap={0} toGap={8} to={targetRef} /> : null}
    </>
  )
}

interface StackDescriptionRootProps extends StackDescriptionProps {
  playgroundRef: RefObject<HTMLElement | null>
}

export function StackDescription({ targetRef, playgroundRef }: StackDescriptionRootProps) {
  const step = useSelector(onboardingStepSelector)
  return PLAYGROUND_ANCHORED_STEPS.has(step) ? (
    <StackDescriptionPlaygroundAnchored targetRef={targetRef} playgroundRef={playgroundRef} />
  ) : (
    <StackDescriptionRelative targetRef={targetRef} />
  )
}
