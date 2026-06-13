import { useSelector } from 'react-redux'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingStep, onboardingStepSelector } from '#features/onboarding'

const TEXT_BY_STEP: Partial<Record<OnboardingStep, string>> = {
  [OnboardingStep.GameStartedCycledInfo]: 'Карты в стеке закончились — они перелистаются заново',
  [OnboardingStep.OpponentTurnCycledInfo]: 'Карты в стеке закончились — они перелистаются заново',
}

export function CenteredDescription() {
  const step = useSelector(onboardingStepSelector)

  return (
    <Box
      sx={{
        position: 'absolute',
        maxWidth: 'min(32rem, calc(100vw - 32px))',
        px: 2,
        zIndex: 2,
        pointerEvents: 'none',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold">
        {TEXT_BY_STEP[step]}
      </Typography>
    </Box>
  )
}
