import { useRef, type RefObject } from 'react'
import { useSelector } from 'react-redux'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingStep, onboardingStepSelector } from '#features/onboarding'
import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'

const TEXT_BY_STEP: Partial<Record<OnboardingStep, string>> = {
  [OnboardingStep.Ligretto]: 'Это твоя колода ligretto',
  [OnboardingStep.LigrettoCard]:
    'Карты из колоды ligretto нужно выкладывать на свободное место в ряду. Раунд закончится, как только первый из игроков выложит все карты из колоды ligretto.',
  [OnboardingStep.LigrettoAvailableCard]: 'Освободилось место в ряду. Выкладывай из колоды ligretto',
}

const TOP_ANCHORED_STEPS = new Set<OnboardingStep>([OnboardingStep.LigrettoCard])

interface LigrettoDescriptionProps {
  targetRef: RefObject<HTMLElement | null>
}

interface LigrettoDescriptionTopAnchoredProps extends LigrettoDescriptionProps {
  playgroundRef: RefObject<HTMLElement | null>
}

function LigrettoDescriptionRelative({ targetRef }: LigrettoDescriptionProps) {
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
      {position ? <OnboardingArrow from={bubbleRef} twist={-0.7} to={targetRef} /> : null}
    </>
  )
}

function LigrettoDescriptionTopAnchored({ targetRef, playgroundRef }: LigrettoDescriptionTopAnchoredProps) {
  const step = useSelector(onboardingStepSelector)
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  // Horizontal anchor — right side of the playground; vertical anchor — top of the ligretto deck.
  const playgroundPosition = useTargetRelativePosition(playgroundRef, containerRef, 'right', 48)
  const ligrettoPosition = useTargetRelativePosition(targetRef, containerRef, 'top', 84)
  const position = playgroundPosition && ligrettoPosition ? { left: playgroundPosition.left, top: ligrettoPosition.top } : null

  return (
    <>
      <Box
        ref={bubbleRef}
        sx={{
          position: 'absolute',
          maxWidth: 'min(28rem, calc(100vw - 32px))',
          px: 2,
          zIndex: 2,
          pointerEvents: 'none',
          ...(position
            ? { left: `${position.left}px`, top: `${position.top}px`, transform: 'translate(0, -50%)', visibility: 'visible' }
            : { left: 0, top: 0, visibility: 'hidden' }),
        }}
      >
        <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold">
          {TEXT_BY_STEP[step]}
        </Typography>
      </Box>
      {position ? <OnboardingArrow twist={1} from={bubbleRef} toAnchor="top" toGap={8} to={targetRef} /> : null}
    </>
  )
}

interface LigrettoDescriptionRootProps extends LigrettoDescriptionProps {
  playgroundRef: RefObject<HTMLElement | null>
}

export function LigrettoDescription({ targetRef, playgroundRef }: LigrettoDescriptionRootProps) {
  const step = useSelector(onboardingStepSelector)
  return TOP_ANCHORED_STEPS.has(step) ? (
    <LigrettoDescriptionTopAnchored targetRef={targetRef} playgroundRef={playgroundRef} />
  ) : (
    <LigrettoDescriptionRelative targetRef={targetRef} />
  )
}
