import { OnboardingStep } from '#features/onboarding'
import { onboardingStepSelector } from '#features/onboarding'
import { Box } from '@memebattle/ui'
import type { PropsWithChildren } from 'react'
import { useSelector } from 'react-redux'

type LayerId = 'playerCards' | 'playgroundCards' | 'opponent'

const TopLayer: Record<LayerId, Set<OnboardingStep>> = {
  playerCards: new Set([OnboardingStep.Cards, OnboardingStep.Stack, OnboardingStep.Row, OnboardingStep.Ligretto]),
  playgroundCards: new Set([OnboardingStep.Playground]),
  opponent: new Set([OnboardingStep.Opponents]),
}

function isCardAbove(layerId: LayerId, currentStep: OnboardingStep): boolean {
  return TopLayer[layerId].has(currentStep)
}

export function Layer({ id, children }: PropsWithChildren<{ id: LayerId }>) {
  const currentStep = useSelector(onboardingStepSelector)

  return (
    <Box position="relative" zIndex={isCardAbove(id, currentStep) ? 1 : undefined}>
      {children}
    </Box>
  )
}
