import { useCallback } from 'react'
import type { FC, ReactNode } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { Box, Button, IconButton, Typography } from '@memebattle/ui'
import { alpha } from '@mui/material/styles'
import { becomeSpectatorEmitAction, GameStatus, kickFromRoomEmitAction, PlayerStatus } from '@memebattle/ligretto-shared'

import { canKickParticipantsSelector, gameIdSelector, gameStatusSelector, playerSelector, spectatorsSelector } from '#ducks/game'
import { userAvatarUrl, userLabel, usersMapSelector } from '#ducks/users'
import { currentUserIdSelector } from '#ducks/auth'
import { Avatar } from '#shared/ui/Avatar'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'
import { NameBadge } from '#shared/ui/NameBadge'

const spectatorsListSelector = createSelector([spectatorsSelector, usersMapSelector, currentUserIdSelector], (spectators, users, currentUserId) =>
  Object.keys(spectators).map(id => {
    const user = users[id]
    return {
      id,
      username: user ? userLabel(user) : '',
      avatar: user ? userAvatarUrl(user) : getRandomAvatar(id),
      isViewer: id === currentUserId,
    }
  }),
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

export const SpectatorsList = () => {
  const dispatch = useDispatch()
  const gameId = useSelector(gameIdSelector)
  const spectators = useSelector(spectatorsListSelector)
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

  if (spectators.length === 0 && !canSpectate) {
    return null
  }

  return (
    <Box data-test-id="GameSettings-Spectators">
      <Box display="flex" alignItems="center" sx={{ gap: 1, mb: 1 }}>
        <VisibilityOutlinedIcon sx={{ fontSize: '1rem', opacity: 0.75 }} />
        <SectionLabel>Spectators · {spectators.length}</SectionLabel>
      </Box>
      <Box display="flex" flexWrap="wrap" sx={{ gap: 1 }}>
        {spectators.map(({ id, username, avatar, isViewer }) => (
          <Box
            key={id}
            display="inline-flex"
            alignItems="center"
            sx={{ gap: 1, py: 0.5, pl: 0.5, pr: 1.5, borderRadius: 999, bgcolor: 'background.lighter' }}
          >
            <Box width="1.75rem" height="1.75rem" overflow="hidden" sx={{ borderRadius: '50%', flexShrink: 0 }}>
              <Avatar src={avatar} size="auto" alt="" />
            </Box>
            <Typography variant="body2" fontWeight={600} noWrap>
              {username}
            </Typography>
            {isViewer && <NameBadge>You</NameBadge>}
            {canKick && !isViewer && (
              <IconButton
                size="small"
                color="inherit"
                aria-label={`Remove ${username} from the room`}
                title="Remove from the room"
                onClick={() => handleKickClick(id)}
                sx={{ mr: -1 }}
                data-test-id="GameSettings-KickSpectatorButton"
              >
                <PersonRemoveOutlinedIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
        {canSpectate && (
          <Button
            onClick={handleSpectateClick}
            color="inherit"
            startIcon={<VisibilityOutlinedIcon />}
            sx={{
              px: 2,
              borderRadius: 999,
              fontWeight: 700,
              border: theme => `2px dashed ${alpha(theme.palette.common.white, 0.35)}`,
            }}
            data-test-id="GameSettings-SpectateButton"
          >
            Spectate
          </Button>
        )}
      </Box>
    </Box>
  )
}

SpectatorsList.displayName = 'SpectatorsList'
