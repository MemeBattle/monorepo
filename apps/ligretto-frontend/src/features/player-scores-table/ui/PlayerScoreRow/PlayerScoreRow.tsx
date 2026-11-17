import type { FC } from 'react'
import last from 'lodash/last'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined'
import { Grid, IconButton, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import type { PlayerStatus } from '@memebattle/ligretto-shared'
import { Avatar } from '#shared/ui/Avatar'
import { NameBadge } from '#shared/ui/NameBadge'

import { columnsProps } from '../columnsProps'
import { PlayersScoresTableCell } from '../PlayersScoresTableCell'
import { PlayersScoresTableRow } from '../PlayersScoresTableRow'
import { PlayerStatusPill } from '../PlayerStatusPill'

export interface PlayersScoresTablePlayer {
  id: string
  username: string
  avatar?: string
  roundPoints: number[]
  totalPoints: number
  isPlayer: boolean
  isHost?: boolean
  status?: PlayerStatus
}

interface PlayerScoreRowProps extends PlayersScoresTablePlayer {
  /** Offers to remove this player from the room */
  onKickClick?: () => void
}

const formatRoundPoints = (points = 0) => (points > 0 ? `+${points}` : String(points))

export const PlayerScoreRow: FC<PlayerScoreRowProps> = ({ username, roundPoints, totalPoints, avatar, isPlayer, isHost, status, onKickClick }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const lastRoundPoints = last(roundPoints) ?? 0

  return (
    <PlayersScoresTableRow sx={{ bgcolor: isPlayer ? 'primary.main' : 'background.lighter' }} data-test-id="PlayersScoresTable-PlayersScoresTableRow">
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
          {isPlayer && <NameBadge>You</NameBadge>}
          {onKickClick && (
            <IconButton
              size="small"
              color="inherit"
              aria-label={`Remove ${username} from the room`}
              title="Remove from the room"
              onClick={onKickClick}
              sx={{ ml: 'auto', flexShrink: 0 }}
              data-test-id="PlayersScoresTable-KickButton"
            >
              <PersonRemoveOutlinedIcon fontSize="small" />
            </IconButton>
          )}
        </PlayersScoresTableCell>
        {status && (
          <PlayersScoresTableCell size={columnsProps.status}>
            <PlayerStatusPill status={status} isCompact={isMobile} />
          </PlayersScoresTableCell>
        )}
        <PlayersScoresTableCell size={columnsProps.round} sx={{ justifyContent: 'flex-end' }}>
          <Typography fontWeight={500} variant="h6" sx={{ color: lastRoundPoints < 0 ? 'warning.main' : 'text.primary' }}>
            {formatRoundPoints(lastRoundPoints)}
          </Typography>
        </PlayersScoresTableCell>
        <PlayersScoresTableCell size={columnsProps.total} sx={{ justifyContent: 'flex-end' }}>
          <Typography fontWeight={800} variant="h5">
            {totalPoints}
          </Typography>
        </PlayersScoresTableCell>
      </Grid>
    </PlayersScoresTableRow>
  )
}

PlayerScoreRow.displayName = 'PlayerScoreRow'
