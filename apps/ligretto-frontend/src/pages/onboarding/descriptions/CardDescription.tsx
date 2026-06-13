import { useRef, type RefObject } from 'react'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'

const TEXT_BY_INDEX: Record<0 | 1, string> = {
  0: 'На свободное место на столе можно выкладывать единицу любого цвета. Давай выложим первую карту!',
  1: 'У тебя есть подходящая карта в ряду',
}

interface CardDescriptionProps {
  index: 0 | 1
  targetRef: RefObject<HTMLElement | null>
}

export function CardDescription({ index, targetRef }: CardDescriptionProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)

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
          top: '2rem',
          left: '2rem',
        }}
      >
        <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold">
          {TEXT_BY_INDEX[index]}
        </Typography>
      </Box>
      <OnboardingArrow from={bubbleRef} to={targetRef} />
    </>
  )
}
