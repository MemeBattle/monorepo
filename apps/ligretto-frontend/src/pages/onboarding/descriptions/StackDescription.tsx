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

interface StackDescriptionProps {
  targetRef: RefObject<HTMLElement | null>
}

export function StackDescription({ targetRef }: StackDescriptionProps) {
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
