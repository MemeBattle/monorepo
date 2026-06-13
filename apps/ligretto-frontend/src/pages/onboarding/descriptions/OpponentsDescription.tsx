import { useRef, type RefObject } from 'react'
import { Box, Typography } from '@memebattle/ui'

import { OnboardingArrow, sCurvePath } from '#shared/ui/OnboardingArrow'

interface OpponentsDescriptionProps {
  opponent0Ref: RefObject<HTMLElement | null>
  opponent1Ref: RefObject<HTMLElement | null>
  opponent2Ref: RefObject<HTMLElement | null>
}

export function OpponentsDescription({ opponent0Ref, opponent1Ref, opponent2Ref }: OpponentsDescriptionProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)

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
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      >
        <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold">
          Это твои соперники
        </Typography>
      </Box>
      <OnboardingArrow path={sCurvePath} from={bubbleRef} to={opponent0Ref} />
      <OnboardingArrow fromGap={16} from={bubbleRef} to={opponent1Ref} />
      <OnboardingArrow twist={-1} from={bubbleRef} to={opponent2Ref} />
    </>
  )
}
