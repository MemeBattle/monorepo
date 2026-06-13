import { useRef, type RefObject } from 'react'
import { useSelector } from 'react-redux'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingStep, onboardingStepSelector } from '#features/onboarding'
import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'

const TEXT_BY_STEP: Partial<Record<OnboardingStep, string>> = {
  [OnboardingStep.Row]: 'Это твои карты в ряду',
}

interface PlayerRowDescriptionProps {
  targetRef: RefObject<HTMLElement | null>
}

export function PlayerRowDescription({ targetRef }: PlayerRowDescriptionProps) {
  const step = useSelector(onboardingStepSelector)
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'top', 124)

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
