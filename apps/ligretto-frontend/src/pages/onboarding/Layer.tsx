import { OnboardingStep } from '#features/onboarding'
import { onboardingStepSelector } from '#features/onboarding'
import { Box } from '@memebattle/ui'
import type { PropsWithChildren } from 'react'
import { useSelector } from 'react-redux'

type LayerId = 'playerCards' | 'playgroundCards' | 'opponent'

/**
 * TopLayer is a record of layer ids and the onboarding steps that should be above them
 */
const TopLayer: Record<LayerId, Set<OnboardingStep>> = {
  playerCards: new Set([
    OnboardingStep.Cards,
    OnboardingStep.Stack,
    OnboardingStep.Row,
    OnboardingStep.Ligretto,
    OnboardingStep.FirstCard,
    OnboardingStep.LigrettoCard,
    OnboardingStep.StackAvailableCard,
    OnboardingStep.StackCard,
    OnboardingStep.StackUnavailableCard,
    OnboardingStep.StackAvailableCard,
    OnboardingStep.RowAvailableCard,
    OnboardingStep.LigrettoAvailableCard,
    OnboardingStep.GameStarted,
    OnboardingStep.GameStartedCycledInfo,
  ]),
  playgroundCards: new Set([
    OnboardingStep.Playground,
    OnboardingStep.FirstCard,
    OnboardingStep.LigrettoCard,
    OnboardingStep.StackAvailableCard,
    OnboardingStep.StackCard,
    OnboardingStep.StackUnavailableCard,
    OnboardingStep.StackAvailableCard,
    OnboardingStep.RowAvailableCard,
    OnboardingStep.LigrettoAvailableCard,
    OnboardingStep.GameStarted,
    OnboardingStep.GameStartedCycledInfo,
  ]),
  opponent: new Set([OnboardingStep.Opponents]),
}

function isLayerAbove(layerId: LayerId, currentStep: OnboardingStep): boolean {
  return TopLayer[layerId].has(currentStep)
}

export function Layer({ id, children }: PropsWithChildren<{ id: LayerId }>) {
  const currentStep = useSelector(onboardingStepSelector)

  return (
    <Box position="relative" zIndex={isLayerAbove(id, currentStep) ? 1 : undefined}>
      {children}
    </Box>
  )
}
