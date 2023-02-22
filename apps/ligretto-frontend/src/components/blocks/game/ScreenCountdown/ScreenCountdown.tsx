import React from 'react'
import { Box } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import { keyframes } from '@mui/system'

interface ScreenCountdownProps {
  timeToGo: number
}

const animation = (timeToGo: number) => {
  const stepSize = Math.floor(100 / (timeToGo - 1))
  const steps = Array.from({ length: timeToGo }).map((_, index) => index * stepSize)

  const timerFrames = steps
    .map(
      (step, index) => `
    ${step}% {
      counter-set: timer-count ${timeToGo - index - 1};
    }
  `,
    )
    .join('')

  return keyframes(`
  from {
    font-size: 15vh;
  }
  ${timerFrames}
  to {
    font-size: 100vh;
  }
  `)
}

const StyledBox = styled(Box, { shouldForwardProp: prop => prop !== 'timeToGo' })<{ timeToGo: number }>(({ timeToGo }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  width: '100%',
  backdropFilter: 'blur(2px)',
  filter: 'drop-shadow(2px 4px 6px #2E2E2E)',
  opacity: 0.5,

  zIndex: 1000,

  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',

  counterReset: 'timer-count 0',
  animation: `${animation(timeToGo)} ${timeToGo}s linear`,
  fontSize: '100vh',

  '&::after': {
    content: 'counter(timer-count)',
  },
}))

export const ScreenCountdown: React.FC<ScreenCountdownProps> = ({ timeToGo }) => <StyledBox timeToGo={timeToGo} />

ScreenCountdown.displayName = 'ScreenCountdown'
