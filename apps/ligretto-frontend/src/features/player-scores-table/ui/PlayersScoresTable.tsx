import type { FC, ReactNode } from 'react'
import times from 'lodash/times'
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'

import { columnsProps } from './columnsProps'
import { FreeSeat } from './FreeSeat/FreeSeat'
import { PlayersScoresTableCell } from './PlayersScoresTableCell'
import { PlayersScoresTableHead } from './PlayersScoresTableHead'

export interface PlayersScoresTableProps {
  /** One row per player */
  children: ReactNode
  /** The rows show each player's status */
  hasStatuses?: boolean
  /** Empty seats listed after the players, inviting more people to join */
  freeSeatsCount?: number
}

const HeadLabel: FC<{ children?: ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} textTransform="uppercase" sx={{ letterSpacing: '0.08em', opacity: 0.75 }}>
    {children}
  </Typography>
)

export const PlayersScoresTable: FC<PlayersScoresTableProps> = ({ children, hasStatuses, freeSeatsCount = 0 }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

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
      {children}
      {times(freeSeatsCount, index => (
        <FreeSeat key={`free-seat-${index}`} offersSeat={index === 0} />
      ))}
    </Box>
  )
}

PlayersScoresTable.displayName = 'PlayersScoresTable'
