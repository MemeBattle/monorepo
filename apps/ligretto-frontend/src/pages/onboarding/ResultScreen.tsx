import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useSelector } from 'react-redux'
import { Box, Button, Typography } from '@memebattle/ui'

import { OnboardingStep, onboardingStepSelector } from '#features/onboarding'
import { routes } from '#shared/constants/router-constants'

export function ResultScreen() {
  const step = useSelector(onboardingStepSelector)
  const navigate = useNavigate()

  const handleFinish = useCallback(() => {
    navigate(routes.HOME)
  }, [navigate])

  if (step !== OnboardingStep.Result) {
    return null
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 4,
      }}
    >
      <Typography variant="h4" fontWeight="bold" textAlign="center">
        Поздравляем! Ты победил!
      </Typography>
      <Button variant="contained" onClick={handleFinish}>
        Закончить обучение
      </Button>
    </Box>
  )
}
