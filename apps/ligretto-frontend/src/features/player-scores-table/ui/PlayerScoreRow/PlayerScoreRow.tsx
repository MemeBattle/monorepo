import { useCallback } from 'react'
import type { FC } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined'
import { Grid, IconButton, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { kickFromRoomEmitAction } from '@memebattle/ligretto-shared'

import { gameIdSelector } from '#ducks/game'
import { Avatar } from '#shared/ui/Avatar'
import { NameBadge } from '#shared/ui/NameBadge'
import type { All } from '#types/store'

import { columnsProps } from '../columnsProps'
import { PlayersScoresTableCell } from '../PlayersScoresTableCell'
import { PlayersScoresTableRow } from '../PlayersScoresTableRow'
import { PlayerStatusPill } from '../PlayerStatusPill'
import { formatRoundPoints } from '../formatRoundPoints'
import { canKickPlayerSelector, playerRowSelector } from './PlayerScoreRow.selectors'

interface PlayerScoreRowProps {
  playerId: string
}

export const PlayerScoreRow: FC<PlayerScoreRowProps> = ({ playerId }) => {
  const dispatch = useDispatch()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const gameId = useSelector(gameIdSelector)
  const player = useSelector((state: All) => playerRowSelector(state, playerId))
  const canKick = useSelector((state: All) => canKickPlayerSelector(state, playerId))

  const handleKickClick = useCallback(() => {
    dispatch(kickFromRoomEmitAction({ gameId, userId: playerId }))
  }, [dispatch, gameId, playerId])

  if (!player) {
    return null
  }

  const { username, avatar, roundScore, gameScore, isViewer, isHost, status } = player

  return (
    <PlayersScoresTableRow sx={{ bgcolor: isViewer ? 'primary.main' : 'background.lighter' }} data-test-id="PlayersScoresTable-PlayersScoresTableRow">
      <Grid container spacing={2} sx={{ flex: 1 }}>
        {!isMobile && (
          <PlayersScoresTableCell size={columnsProps.avatar}>
            <Avatar src={avatar} size="small" />
          </PlayersScoresTableCell>
        )}
        <PlayersScoresTableCell size={columnsProps.name} sx={{ gap: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600} noWrap title={username}>
            {username}
          </Typography>
          {isHost && (
            <NameBadge isAccent>
              <WorkspacePremiumOutlinedIcon sx={{ fontSize: '0.875rem', verticalAlign: 'text-bottom', mr: 0.25 }} />
              Host
            </NameBadge>
          )}
          {isViewer && <NameBadge>You</NameBadge>}
          {canKick && (
            <IconButton
              size="small"
              color="inherit"
              aria-label={`Remove ${username} from the room`}
              title="Remove from the room"
              onClick={handleKickClick}
              sx={{ ml: 'auto', flexShrink: 0 }}
              data-test-id="PlayersScoresTable-KickButton"
            >
              <PersonRemoveOutlinedIcon fontSize="small" />
            </IconButton>
          )}
        </PlayersScoresTableCell>
        <PlayersScoresTableCell size={columnsProps.status}>
          <PlayerStatusPill status={status} isCompact={isMobile} />
        </PlayersScoresTableCell>
        <PlayersScoresTableCell size={columnsProps.round} sx={{ justifyContent: 'flex-end' }}>
          <Typography fontWeight={500} variant="h6" sx={{ color: roundScore < 0 ? 'warning.main' : 'text.primary' }}>
            {formatRoundPoints(roundScore)}
          </Typography>
        </PlayersScoresTableCell>
        <PlayersScoresTableCell size={columnsProps.total} sx={{ justifyContent: 'flex-end' }}>
          <Typography fontWeight={800} variant="h5">
            {gameScore}
          </Typography>
        </PlayersScoresTableCell>
      </Grid>
    </PlayersScoresTableRow>
  )
}

PlayerScoreRow.displayName = 'PlayerScoreRow'
