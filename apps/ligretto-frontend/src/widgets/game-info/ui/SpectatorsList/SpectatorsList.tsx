import { useCallback } from 'react'
import type { FC, ReactNode } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { Box, Button, IconButton, Typography } from '@memebattle/ui'
import { alpha } from '@mui/material/styles'
import type { Theme } from '@mui/material/styles'
import { becomeSpectatorEmitAction, GameStatus, kickFromRoomEmitAction, PlayerStatus } from '@memebattle/ligretto-shared'

import { canKickParticipantsSelector, gameIdSelector, gameStatusSelector, playerSelector, spectatorsSelector } from '#ducks/game'
import { userAvatarUrl, userLabel, usersMapSelector } from '#ducks/users'
import { currentUserIdSelector } from '#ducks/auth'
import { Avatar } from '#shared/ui/Avatar'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'
import { NameBadge } from '#shared/ui/NameBadge'

interface SpectatorView {
  id: string
  username: string
  avatar: string
}

const toSpectatorView = (users: ReturnType<typeof usersMapSelector>, id: string): SpectatorView => {
  const user = users[id]
  return { id, username: user ? userLabel(user) : '', avatar: user ? userAvatarUrl(user) : getRandomAvatar(id) }
}

const otherSpectatorsSelector = createSelector([spectatorsSelector, usersMapSelector, currentUserIdSelector], (spectators, users, currentUserId) =>
  Object.keys(spectators)
    .filter(id => id !== currentUserId)
    .map(id => toSpectatorView(users, id)),
)

const viewerSelector = createSelector([spectatorsSelector, usersMapSelector, currentUserIdSelector], (spectators, users, currentUserId) =>
  currentUserId ? { ...toSpectatorView(users, currentUserId), isSpectating: !!spectators[currentUserId] } : null,
)

const canSpectateSelector = createSelector(
  [playerSelector, gameStatusSelector],
  (player, gameStatus) =>
    !!player &&
    !player.isHost &&
    player.status !== PlayerStatus.Disconnected &&
    (gameStatus === GameStatus.New || gameStatus === GameStatus.RoundFinished),
)

const SectionLabel: FC<{ children: ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} textTransform="uppercase" sx={{ letterSpacing: '0.08em', opacity: 0.75 }}>
    {children}
  </Typography>
)

const pillSx = {
  display: 'inline-flex',
  alignItems: 'center',
  height: '2.25rem',
  pl: '2px',
  pr: '10px',
  border: '2px solid transparent',
  borderRadius: 999,
}

const spectateButtonSx = { ...pillSx, minWidth: 0, borderStyle: 'dashed', borderColor: (theme: Theme) => alpha(theme.palette.common.white, 0.35) }

const SpectatorChipContent: FC<SpectatorView & { isViewer?: boolean }> = ({ username, avatar, isViewer }) => (
  <Box display="inline-flex" alignItems="center" sx={{ gap: 1 }}>
    <Box width="1.75rem" height="1.75rem" overflow="hidden" sx={{ borderRadius: '50%', flexShrink: 0 }}>
      <Avatar src={avatar} size="auto" alt="" />
    </Box>
    <Typography variant="body2" fontWeight={600} noWrap>
      {username}
    </Typography>
    {isViewer && <NameBadge>You</NameBadge>}
  </Box>
)

const SpectateLabel = () => (
  <Box display="inline-flex" alignItems="center" sx={{ gap: 1 }}>
    <Box display="flex" alignItems="center" justifyContent="center" width="1.75rem" height="1.75rem" sx={{ flexShrink: 0 }}>
      <VisibilityOutlinedIcon sx={{ fontSize: '1.25rem' }} />
    </Box>
    <Typography variant="button" fontWeight={700} noWrap>
      Spectate
    </Typography>
  </Box>
)

/**
 * The Spectate button and the viewer's own chip replace each other when the viewer switches roles. Both keep their
 * own width, but the slot reserves the wider one with an invisible copy, so the chips around it never rewrap.
 */
const ViewerSlot: FC<{ children: ReactNode; counterpart: ReactNode }> = ({ children, counterpart }) => (
  <Box display="grid" sx={{ justifyItems: 'start', '& > *': { gridArea: '1 / 1' } }}>
    {children}
    <Box aria-hidden display="flex" sx={{ visibility: 'hidden' }}>
      {counterpart}
    </Box>
  </Box>
)

export const SpectatorsList = () => {
  const dispatch = useDispatch()
  const gameId = useSelector(gameIdSelector)
  const otherSpectators = useSelector(otherSpectatorsSelector)
  const viewer = useSelector(viewerSelector)
  const canSpectate = useSelector(canSpectateSelector)
  const canKick = useSelector(canKickParticipantsSelector)

  const handleSpectateClick = useCallback(() => {
    dispatch(becomeSpectatorEmitAction({ gameId }))
  }, [dispatch, gameId])

  const handleKickClick = useCallback(
    (userId: string) => {
      dispatch(kickFromRoomEmitAction({ gameId, userId }))
    },
    [dispatch, gameId],
  )

  const spectatorsCount = otherSpectators.length + (viewer?.isSpectating ? 1 : 0)

  if (spectatorsCount === 0 && !canSpectate) {
    return null
  }

  return (
    <Box data-test-id="GameSettings-Spectators">
      <Box display="flex" alignItems="center" sx={{ gap: 1, mb: 1 }}>
        <VisibilityOutlinedIcon sx={{ fontSize: '1rem', opacity: 0.75 }} />
        <SectionLabel>Spectators · {spectatorsCount}</SectionLabel>
      </Box>
      <Box display="flex" flexWrap="wrap" sx={{ gap: 1 }}>
        {otherSpectators.map(spectator => (
          <Box key={spectator.id} sx={{ ...pillSx, bgcolor: 'background.lighter' }}>
            <SpectatorChipContent {...spectator} />
            {canKick && (
              <IconButton
                size="small"
                color="inherit"
                aria-label={`Remove ${spectator.username} from the room`}
                title="Remove from the room"
                onClick={() => handleKickClick(spectator.id)}
                sx={{ ml: 1, mr: -1 }}
                data-test-id="GameSettings-KickSpectatorButton"
              >
                <PersonRemoveOutlinedIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
        {viewer?.isSpectating && (
          <ViewerSlot
            counterpart={
              <Box sx={spectateButtonSx}>
                <SpectateLabel />
              </Box>
            }
          >
            <Box sx={{ ...pillSx, bgcolor: 'background.lighter' }} data-test-id="GameSettings-ViewerSpectatorBadge">
              <SpectatorChipContent {...viewer} isViewer />
            </Box>
          </ViewerSlot>
        )}
        {canSpectate && viewer && (
          <ViewerSlot
            counterpart={
              <Box sx={pillSx}>
                <SpectatorChipContent {...viewer} isViewer />
              </Box>
            }
          >
            <Button onClick={handleSpectateClick} color="inherit" sx={spectateButtonSx} data-test-id="GameSettings-SpectateButton">
              <SpectateLabel />
            </Button>
          </ViewerSlot>
        )}
      </Box>
    </Box>
  )
}

SpectatorsList.displayName = 'SpectatorsList'
