import Popper from '@mui/material/Popper'
import Fade from '@mui/material/Fade'

import TouchAppIcon from '@mui/icons-material/TouchApp'
import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { Box } from '@memebattle/ui'

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
              <TouchAppIcon fontSize="large" />
            </Box>
          </Fade>
        )}
      </Popper>
    </>
  )
}
