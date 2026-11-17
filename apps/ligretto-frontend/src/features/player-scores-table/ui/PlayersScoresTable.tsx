import type { FC, ReactNode } from 'react'
import last from 'lodash/last'
import times from 'lodash/times'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined'
import { Box, Button, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { alpha } from '@mui/material/styles'
import type { PlayerStatus } from '@memebattle/ligretto-shared'
import { Avatar } from '#shared/ui/Avatar'
import { NameBadge } from '#shared/ui/NameBadge'

import { PlayersScoresTableCell } from './PlayersScoresTableCell'
import { PlayersScoresTableHead } from './PlayersScoresTableHead'
import { PlayersScoresTableRow } from './PlayersScoresTableRow'
import { PlayerStatusPill } from './PlayerStatusPill'
import { RoomInviteLink } from './RoomInviteLink/RoomInviteLink'

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

export interface PlayersScoresTableProps {
  /** Players results */
  players: PlayersScoresTablePlayer[]
  /** Empty seats listed after the players, inviting more people to join */
  freeSeatsCount?: number
  /** Offered on every free seat to a viewer who is spectating */
  onTakeSeat?: () => void
}

const columnsProps = {
  avatar: { sm: 1 },
  name: 'grow',
  status: { xs: 'auto', sm: 3 },
  round: { xs: 2, sm: 2 },
  total: { xs: 2, sm: 2 },
} as const

const formatRoundPoints = (points = 0) => (points > 0 ? `+${points}` : String(points))

const HeadLabel: FC<{ children?: ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} textTransform="uppercase" sx={{ letterSpacing: '0.08em', opacity: 0.75 }}>
    {children}
  </Typography>
)

export const PlayersScoresTable: FC<PlayersScoresTableProps> = ({ players, freeSeatsCount = 0, onTakeSeat }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const hasStatuses = players.some(player => player.status)

  return (
    <Box flex={1} flexDirection="column" overflow="auto" data-test-id="PlayersScoresTable">
      <PlayersScoresTableHead>
        <Grid container spacing={2} sx={{ flex: 1 }}>
          {!isMobile && <PlayersScoresTableCell size={columnsProps.avatar} />}
          <PlayersScoresTableCell size={columnsProps.name}>
            <HeadLabel>Player</HeadLabel>
          </PlayersScoresTableCell>
          {hasStatuses && <PlayersScoresTableCell size={columnsProps.status}>{!isMobile && <HeadLabel>Status</HeadLabel>}</PlayersScoresTableCell>}
          <PlayersScoresTableCell size={columnsProps.round} sx={{ justifyContent: 'flex-end' }}>
            <HeadLabel>Round</HeadLabel>
          </PlayersScoresTableCell>
          <PlayersScoresTableCell size={columnsProps.total} sx={{ justifyContent: 'flex-end' }}>
            <HeadLabel>Total</HeadLabel>
          </PlayersScoresTableCell>
        </Grid>
      </PlayersScoresTableHead>
      {players.map(({ username, roundPoints, totalPoints, avatar, isPlayer, isHost, status, id }) => {
        const lastRoundPoints = last(roundPoints) ?? 0

        return (
          <PlayersScoresTableRow
            key={id}
            sx={{ bgcolor: isPlayer ? 'primary.main' : 'background.lighter' }}
            data-test-id="PlayersScoresTable-PlayersScoresTableRow"
          >
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
              </PlayersScoresTableCell>
              {hasStatuses && (
                <PlayersScoresTableCell size={columnsProps.status}>
                  {status && <PlayerStatusPill status={status} isCompact={isMobile} />}
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
      })}
      {times(freeSeatsCount, index => (
        <PlayersScoresTableRow
          key={`free-seat-${index}`}
          sx={{ border: `1px dashed ${alpha(theme.palette.common.white, 0.35)}` }}
          data-test-id="PlayersScoresTable-FreeSeat"
        >
          <Grid container spacing={2} sx={{ flex: 1 }}>
            {!isMobile && (
              <PlayersScoresTableCell size={columnsProps.avatar}>
                <Box width="3rem" height="3rem" borderRadius="50%" border={`1px dashed ${alpha(theme.palette.common.white, 0.5)}`} />
              </PlayersScoresTableCell>
            )}
            <PlayersScoresTableCell size="grow">
              <Typography variant="body1" sx={{ opacity: 0.85 }}>
                Free seat
              </Typography>
            </PlayersScoresTableCell>
            <PlayersScoresTableCell size={{ xs: 12, sm: 'auto' }}>
              <RoomInviteLink />
            </PlayersScoresTableCell>
            {onTakeSeat && (
              <PlayersScoresTableCell size="auto">
                <Button
                  onClick={onTakeSeat}
                  variant="contained"
                  color="secondary"
                  startIcon={<ArrowForwardRoundedIcon />}
                  sx={{ fontWeight: 800 }}
                  data-test-id="PlayersScoresTable-TakeSeatButton"
                >
                  Sit here
                </Button>
              </PlayersScoresTableCell>
            )}
          </Grid>
        </PlayersScoresTableRow>
      ))}
    </Box>
  )
}

PlayersScoresTable.displayName = 'PlayersScoresTable'
