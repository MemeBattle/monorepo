import { useRef, type RefObject } from 'react'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '../useTargetRelativePosition'

interface PlaygroundDescriptionProps {
  targetRef: RefObject<HTMLElement | null>
}

export function PlaygroundDescription({ targetRef }: PlaygroundDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(targetRef, containerRef, 'left', 48)

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
            ? { left: `${position.left}px`, top: `${position.top - 148}px`, transform: position.transform, visibility: 'visible' }
            : { left: 0, top: 0, visibility: 'hidden' }),
        }}
      >
        <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold">
          Это общий стол.
          <br />
          Сюда будем выкладывать карты
        </Typography>
      </Box>
      {position ? <OnboardingArrow fromAnchor="bottom" toAnchor="left" from={bubbleRef} to={targetRef} /> : null}
    </>
  )
}
