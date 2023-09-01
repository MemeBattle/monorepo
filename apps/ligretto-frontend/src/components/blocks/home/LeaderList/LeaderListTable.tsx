import type { FC } from 'react'
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { Avatar } from 'components/Avatar'

import { LeaderListTableCell } from './LeaderListTableCell'
import { LeaderListTableHead } from './LeaderListTableHead'
import { LeaderListTableRow } from './LeaderListTableRow'

import firstLevelImg from './assets/1_place.svg'
import secondLevelImg from './assets/2_place.svg'
import thirdLevelImg from './assets/3_place.svg'

export interface LeaderListTableProps {
  /** Players results */
  leaders: Array<{ username: string; avatar?: string; totalPoints: number; id: string; userPlace: number }>
}

const columnsProps = {
  level: { md: 1.25 },
  avatar: { md: 1 },
  name: { md: 9 },
  totalPoints: { md: 1.75 },
}

const levels = [firstLevelImg, secondLevelImg, thirdLevelImg]

export const LeaderListTable: FC<LeaderListTableProps> = ({ leaders }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Box flex={1} flexDirection="column" overflow="auto" data-test-id="PlayersScoresTable">
      <LeaderListTableHead>
        <Grid container item xs spacing={4}>
          <LeaderListTableCell {...columnsProps.level} justifyContent="center">
            <Typography variant="body1" color={theme.palette.text.disabled}>
              #
            </Typography>
          </LeaderListTableCell>
          <LeaderListTableCell {...columnsProps.name} justifyContent="center">
            {!isMobile && <LeaderListTableCell {...columnsProps.avatar}></LeaderListTableCell>}
            <LeaderListTableCell justifyContent="center">
              <Typography variant="body1" color={theme.palette.text.disabled}>
                Player
              </Typography>
            </LeaderListTableCell>
          </LeaderListTableCell>
          <LeaderListTableCell {...columnsProps.totalPoints} justifyContent="center">
            <Typography variant="body1" color={theme.palette.text.disabled}>
              Points
            </Typography>
          </LeaderListTableCell>
        </Grid>
      </LeaderListTableHead>
      {leaders.map(({ username, avatar, id, totalPoints, userPlace }, i) => (
        <LeaderListTableRow
          key={id}
          background={theme.palette.primary.lighter}
          //data-test-id="PlayersScoresTable-PlayersScoresTableRow"
        >
          <Grid container item xs spacing={4}>
            <LeaderListTableCell {...columnsProps.level}>
              {i < 3 && <img src={levels[i]} />}
              {i === 3 && (
                <Typography variant="h5" whiteSpace="nowrap" overflow="auto">
                  {userPlace}
                </Typography>
              )}
            </LeaderListTableCell>
            <LeaderListTableCell {...columnsProps.name}>
              {!isMobile && (
                <LeaderListTableCell {...columnsProps.avatar}>
                  <Avatar src={avatar} size="small" />
                </LeaderListTableCell>
              )}
              <LeaderListTableCell {...columnsProps.name}>
                <Typography variant="h5" whiteSpace="nowrap" overflow="auto">
                  {username}
                </Typography>
              </LeaderListTableCell>
            </LeaderListTableCell>

            <LeaderListTableCell {...columnsProps.totalPoints} justifyContent="center">
              <Typography fontWeight={500} variant="h5">
                {totalPoints}
              </Typography>
            </LeaderListTableCell>
          </Grid>
        </LeaderListTableRow>
      ))}
    </Box>
  )
}

LeaderListTable.displayName = 'PlayersScoresTable'
