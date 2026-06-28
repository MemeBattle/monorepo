import { useRef, type RefObject } from 'react'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

import { useOnboardingContainerRef } from '../targets'
import { useTargetRelativePosition } from '#shared/lib/hooks/useTargetRelativePosition'

const TEXT_BY_INDEX: Record<0 | 1, string> = {
  0: 'На свободное место на столе можно выкладывать единицу любого цвета. Давай выложим первую карту!',
  1: 'У тебя есть подходящая карта в ряду',
}

interface CardDescriptionProps {
  index: 0 | 1
  targetRef: RefObject<HTMLElement | null>
  playgroundRef: RefObject<HTMLElement | null>
}

export function CardDescription({ index, targetRef, playgroundRef }: CardDescriptionProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  // Horizontal anchor — left side of the playground; vertical anchor — center of the highlighted card.
  const playgroundPosition = useTargetRelativePosition(playgroundRef, containerRef, 'left', 48)
  const cardPosition = useTargetRelativePosition(targetRef, containerRef, 'top', 84)
  const position = playgroundPosition && cardPosition ? { left: playgroundPosition.left, top: cardPosition.top } : null

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
            ? { left: `${position.left}px`, top: `${position.top}px`, transform: 'translate(-100%, -50%)', visibility: 'visible' }
            : { left: 0, top: 0, visibility: 'hidden' }),
        }}
      >
        <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold">
          {TEXT_BY_INDEX[index]}
        </Typography>
      </Box>
      {position ? <OnboardingArrow twist={-1} from={bubbleRef} toAnchor="top" toGap={8} to={targetRef} /> : null}
    </>
  )
}
