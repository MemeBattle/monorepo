import { useSelector } from 'react-redux'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'
import { OnboardingStep, onboardingStepSelector } from '#features/onboarding'

import { useOnboardingTargetRef, type OnboardingTargetId } from './targets'

const STEP_TARGET: Partial<Record<OnboardingStep, OnboardingTargetId>> = {
  [OnboardingStep.Opponents]: 'opponents',
  [OnboardingStep.Playground]: 'playground',
  [OnboardingStep.Cards]: 'playerRow',
  [OnboardingStep.Stack]: 'stack',
  [OnboardingStep.Row]: 'playerRow',
  [OnboardingStep.Ligretto]: 'ligretto',
  [OnboardingStep.FirstCard]: 'card0',
  [OnboardingStep.LigrettoCard]: 'ligretto',
  [OnboardingStep.StackCard]: 'stack',
  [OnboardingStep.StackUnavailableCard]: 'stack',
  [OnboardingStep.StackAvailableCard]: 'stack',
  [OnboardingStep.RowAvailableCard]: 'card1',
  [OnboardingStep.LigrettoAvailableCard]: 'ligretto',
}

export function StepArrow() {
  const step = useSelector(onboardingStepSelector)
  const descriptionRef = useOnboardingTargetRef('description')
  const targetId = STEP_TARGET[step]
  const targetRef = useOnboardingTargetRef(targetId ?? 'description')

  if (!targetId) {
    return null
  }

  return <OnboardingArrow from={descriptionRef} to={targetRef} />
}
