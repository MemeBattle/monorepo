import Popper from '@mui/material/Popper'
import Fade from '@mui/material/Fade'

import TouchAppIcon from '@mui/icons-material/TouchApp'
import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { Box } from '@memebattle/ui'
import { styled, keyframes } from '@mui/material/styles'

const pulse = keyframes({
  '0%': {
    transform: 'scale(1)',
  },
  '50%': {
    transform: 'scale(1.5)',
  },
  '100%': {
    transform: 'scale(1)',
  },
})

const AnimatedTouchAppIcon = styled(TouchAppIcon)({
  animation: `${pulse} 2s ease-in-out infinite`,
})

export function TouchHint({ children }: PropsWithChildren) {
  const anchorRef = useRef()

  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const timerId = setTimeout(() => {
      setIsVisible(true)
    }, 3000)

    return () => clearTimeout(timerId)
  }, [])

  return (
    <>
      <Box ref={anchorRef}>{children}</Box>

      <Popper
        modifiers={[
          {
            name: 'flip',
            enabled: false,
            options: {
              altBoundary: false,
              rootBoundary: 'document',
              padding: 8,
            },
          },
        ]}
        open={isVisible}
        anchorEl={anchorRef.current}
        disablePortal
        transition
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps}>
            <Box marginTop="-1.2rem">
              <AnimatedTouchAppIcon fontSize="large" />
            </Box>
          </Fade>
        )}
      </Popper>
    </>
  )
}
