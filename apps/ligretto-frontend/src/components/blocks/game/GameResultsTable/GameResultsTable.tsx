import type { FC } from 'react'
import last from 'lodash/last'
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { Avatar } from 'components/Avatar'

import { GameResultTableCell } from './GameResultsTableCell'
import { GameResultTableHead } from './GameResultsTableHead'
import { GameResultTableRow } from './GameResultsTableRow'

export interface GameResultsTableProps {
  /** Players results */
  players: Array<{ position: number; username: string; avatar?: string; roundPoints: number[]; totalPoints: number; isPlayer: boolean }>
}

const columnsProps = {
  avatar: { sm: 2, md: 1 },
  name: { xs: 6, sm: 4 },
  round: { xs: 3, sm: true },
  total: { xs: 3, sm: 2, md: 1 },
}

export const GameResultsTable: FC<GameResultsTableProps> = ({ players }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Box flexDirection="column">
      <GameResultTableHead>
        <Grid container item xs spacing={4}>
          {!isMobile && <GameResultTableCell {...columnsProps.avatar}></GameResultTableCell>}
          <GameResultTableCell {...columnsProps.name}>
            <Typography variant="body2">Name</Typography>
          </GameResultTableCell>
          <GameResultTableCell {...columnsProps.round} justifyContent="flex-end">
            <Typography variant="body2">Round</Typography>
          </GameResultTableCell>
          <GameResultTableCell {...columnsProps.total} justifyContent="flex-end">
            <Typography variant="body2">Total</Typography>
          </GameResultTableCell>
        </Grid>
      </GameResultTableHead>
      {players.map(({ username, roundPoints, totalPoints, avatar, isPlayer }, index) => (
        <GameResultTableRow key={index} bgcolor={isPlayer ? theme.palette.primary.light : theme.palette.primary.lighter}>
          <Grid container item xs spacing={4}>
            {!isMobile && (
              <GameResultTableCell {...columnsProps.avatar}>
                <Avatar src={avatar} size="small" />
              </GameResultTableCell>
            )}
            <GameResultTableCell {...columnsProps.name}>
              <Typography variant="h5" whiteSpace="nowrap" overflow="auto">
                {username}
              </Typography>
            </GameResultTableCell>
            <GameResultTableCell {...columnsProps.round} justifyContent="flex-end">
              <Typography fontWeight={500} variant="h5">
                {last(roundPoints)}
              </Typography>
            </GameResultTableCell>
            <GameResultTableCell {...columnsProps.total} justifyContent="flex-end">
              <Typography fontWeight={500} variant="h5">
                {totalPoints}
              </Typography>
            </GameResultTableCell>
          </Grid>
        </GameResultTableRow>
      ))}
    </Box>
  )
}

GameResultsTable.displayName = 'ResultsTable'
