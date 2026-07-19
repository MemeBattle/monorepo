import type { PropsWithChildren } from 'react'
import { useSelector } from 'react-redux'
import { Box } from '@memebattle/ui'

import { onboardingStepSelector } from '#features/onboarding'

import type { LayerId } from './stepConfig'
import { STEP_CONFIGS } from './stepConfig'

/**
 * Raises a game zone above the dimming Overlay (z-index: 1) so that the zone
 * stays bright and clickable on the current step.
 * Which zones are raised on which step is defined by the step config's `raisedLayers`.
 */
export function Layer({ id, children }: PropsWithChildren<{ id: LayerId }>) {
  const currentStep = useSelector(onboardingStepSelector)
  const isRaised = STEP_CONFIGS[currentStep].raisedLayers.includes(id)

  return <Box sx={{ position: 'relative', zIndex: isRaised ? 1 : undefined }}>{children}</Box>
}
