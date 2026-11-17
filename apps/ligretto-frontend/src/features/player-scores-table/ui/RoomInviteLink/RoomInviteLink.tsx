import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { generatePath } from 'react-router'
import Tooltip from '@mui/material/Tooltip'
import { Box, Link } from '@memebattle/ui'

import { gameIdSelector } from '#ducks/game'
import { routes } from '#shared/constants'

import { shareRoomLink } from './shareRoomLink'

const FEEDBACK_DURATION_MS = 2000

const feedbackMessages = {
  copied: 'Room link copied',
  failed: "Couldn't share the room link. Copy it from the address bar instead.",
}

type Feedback = keyof typeof feedbackMessages

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const

export const RoomInviteLink = () => {
  const gameId = useSelector(gameIdSelector)
  const [feedback, setFeedback] = useState<Feedback>()
  const hideFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latestClickIdRef = useRef(0)

  useEffect(() => () => clearTimeout(hideFeedbackTimeoutRef.current), [])

  const handleClick = async () => {
    const clickId = ++latestClickIdRef.current
    clearTimeout(hideFeedbackTimeoutRef.current)
    setFeedback(undefined)

    const roomUrl = new URL(generatePath(routes.GAME, { roomUuid: gameId }), window.location.origin).href
    const result = await shareRoomLink(roomUrl)

    if (clickId === latestClickIdRef.current && (result === 'copied' || result === 'failed')) {
      setFeedback(result)
      hideFeedbackTimeoutRef.current = setTimeout(() => setFeedback(undefined), FEEDBACK_DURATION_MS)
    }
  }

  const message = feedback ? feedbackMessages[feedback] : ''

  return (
    <>
      <Tooltip title={message} open={Boolean(feedback)} describeChild arrow disableFocusListener disableHoverListener disableTouchListener>
        <Link
          component="button"
          variant="body2"
          color="inherit"
          underline="hover"
          onClick={handleClick}
          sx={{ minHeight: '2.75rem', textAlign: 'start', opacity: 0.85 }}
        >
          Invite friends to join you!
        </Link>
      </Tooltip>
      {/* A tooltip is not a live region; this one, mounted empty, lets screen readers announce the feedback. */}
      <Box component="span" role="status" sx={visuallyHidden}>
        {message}
      </Box>
    </>
  )
}

RoomInviteLink.displayName = 'RoomInviteLink'
