import type { FC } from 'react'
import last from 'lodash/last'
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { Avatar } from 'components/Avatar'

import { PlayersScoresTableCell } from './PlayersScoresTableCell'
import { PlayersScoresTableHead } from './PlayersScoresTableHead'
import { PlayersScoresTableRow } from './PlayersScoresTableRow'

export interface PlayersScoresTableProps {
  /** Players results */
  players: Array<{ username: string; avatar?: string; roundPoints: number[]; totalPoints: number; isPlayer: boolean }>
}

const columnsProps = {
  avatar: { sm: 2, md: 1 },
  name: { xs: 6, sm: 4 },
  round: { xs: 3, sm: true },
  total: { xs: 3, sm: 2, md: 1 },
}

export const PlayersScoresTable: FC<PlayersScoresTableProps> = ({ players }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Box flex={1} flexDirection="column" overflow="scroll">
      <PlayersScoresTableHead>
        <Grid container item xs spacing={4}>
          {!isMobile && <PlayersScoresTableCell {...columnsProps.avatar}></PlayersScoresTableCell>}
          <PlayersScoresTableCell {...columnsProps.name}>
            <Typography variant="body2">Name</Typography>
          </PlayersScoresTableCell>
          <PlayersScoresTableCell {...columnsProps.round} justifyContent="flex-end">
            <Typography variant="body2">Round</Typography>
          </PlayersScoresTableCell>
          <PlayersScoresTableCell {...columnsProps.total} justifyContent="flex-end">
            <Typography variant="body2">Total</Typography>
          </PlayersScoresTableCell>
        </Grid>
      </PlayersScoresTableHead>
      {players.map(({ username, roundPoints, totalPoints, avatar, isPlayer }, index) => (
        <PlayersScoresTableRow key={index} bgcolor={isPlayer ? theme.palette.primary.light : theme.palette.primary.lighter}>
          <Grid container item xs spacing={4}>
            {!isMobile && (
              <PlayersScoresTableCell {...columnsProps.avatar}>
                <Avatar src={avatar} size="small" />
              </PlayersScoresTableCell>
            )}
            <PlayersScoresTableCell {...columnsProps.name}>
              <Typography variant="h5" whiteSpace="nowrap" overflow="auto">
                {username}
              </Typography>
            </PlayersScoresTableCell>
            <PlayersScoresTableCell {...columnsProps.round} justifyContent="flex-end">
              <Typography fontWeight={500} variant="h5">
                {last(roundPoints)}
              </Typography>
            </PlayersScoresTableCell>
            <PlayersScoresTableCell {...columnsProps.total} justifyContent="flex-end">
              <Typography fontWeight={500} variant="h5">
                {totalPoints}
              </Typography>
            </PlayersScoresTableCell>
          </Grid>
        </PlayersScoresTableRow>
      ))}
    </Box>
  )
}

PlayersScoresTable.displayName = 'PlayersScoresTable'
