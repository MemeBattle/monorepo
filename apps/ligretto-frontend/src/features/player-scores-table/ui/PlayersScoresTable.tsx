import type { FC, ReactNode } from 'react'
import last from 'lodash/last'
import times from 'lodash/times'
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined'
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import type { PlayerStatus } from '@memebattle/ligretto-shared'
import { Avatar } from '#shared/ui/Avatar'
import { NameBadge } from '#shared/ui/NameBadge'

import { columnsProps } from './columnsProps'
import { FreeSeat } from './FreeSeat/FreeSeat'
import { PlayersScoresTableCell } from './PlayersScoresTableCell'
import { PlayersScoresTableHead } from './PlayersScoresTableHead'
import { PlayersScoresTableRow } from './PlayersScoresTableRow'
import { PlayerStatusPill } from './PlayerStatusPill'

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
}

const formatRoundPoints = (points = 0) => (points > 0 ? `+${points}` : String(points))

const HeadLabel: FC<{ children?: ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} textTransform="uppercase" sx={{ letterSpacing: '0.08em', opacity: 0.75 }}>
    {children}
  </Typography>
)

export const PlayersScoresTable: FC<PlayersScoresTableProps> = ({ players, freeSeatsCount = 0 }) => {
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
        <FreeSeat key={`free-seat-${index}`} />
      ))}
    </Box>
  )
}

PlayersScoresTable.displayName = 'PlayersScoresTable'
