import type { FC, ReactNode } from 'react'
import { Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'

import { columnsProps } from './columnsProps'
import { PlayersScoresTableCell } from './PlayersScoresTableCell'
import { PlayersScoresTableHead } from './PlayersScoresTableHead'

interface PlayersScoresTableHeaderProps {
  /** The rows show each player's status */
  hasStatuses?: boolean
}

const HeadLabel: FC<{ children?: ReactNode }> = ({ children }) => (
  <Typography variant="caption" fontWeight={700} textTransform="uppercase" sx={{ letterSpacing: '0.08em', opacity: 0.75 }}>
    {children}
  </Typography>
)

export const PlayersScoresTableHeader: FC<PlayersScoresTableHeaderProps> = ({ hasStatuses }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
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
  )
}

PlayersScoresTableHeader.displayName = 'PlayersScoresTableHeader'
