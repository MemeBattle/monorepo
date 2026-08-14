// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { OnboardingEvent } from '#features/onboarding'
import { getOnboardingPlacementAction } from './onboardingPlacement'

describe('getOnboardingPlacementAction', () => {
  it('routes a focused second row card only to the first playground deck', () => {
    expect(getOnboardingPlacementAction({ type: 'row', index: 1 }, [OnboardingEvent.PutSecondCard], 1)).toBeUndefined()
    expect(getOnboardingPlacementAction({ type: 'row', index: 1 }, [OnboardingEvent.PutSecondCard], 0)?.type).toBe(
      'features/onboarding/putSecondCard',
    )
  })

  it('routes a focused open-stack card only to the first playground deck', () => {
    expect(getOnboardingPlacementAction({ type: 'open-stack' }, [OnboardingEvent.PutStackCard], 1)).toBeUndefined()
    expect(getOnboardingPlacementAction({ type: 'open-stack' }, [OnboardingEvent.PutStackCard], 0)?.type).toBe('features/onboarding/putStackCard')
  })

  it('routes the focused third row card only to the opponent deck', () => {
    expect(getOnboardingPlacementAction({ type: 'row', index: 2 }, [OnboardingEvent.PutThirdCard], 0)).toBeUndefined()
    expect(getOnboardingPlacementAction({ type: 'row', index: 2 }, [OnboardingEvent.PutThirdCard], 2)?.type).toBe('features/onboarding/putThirdCard')
  })
})
