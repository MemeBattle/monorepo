import { useRef, type RefObject } from 'react'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '../useTargetRelativePosition'

interface AllCardsDescriptionProps {
  playerRowRef: RefObject<HTMLElement | null>
}

export function AllCardsDescription({ playerRowRef }: AllCardsDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const position = useTargetRelativePosition(playerRowRef, containerRef, 'top', 160)

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
          Это твои карты
        </Typography>
      </Box>
      {position ? <OnboardingArrow from={bubbleRef} to={playerRowRef} /> : null}
    </>
  )
}
