import type { FC } from 'react'
import { Avatar } from 'shared/ui/Avatar'
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'

import { LeaderListTableCell } from './LeaderListTableCell'
import { LeaderListTableRow } from './LeaderListTableRow'
import type { LeaderBoardRowProps } from '../LeaderBoard/LeaderBoard'

import firstLevelImg from './assets/1_place.svg'
import secondLevelImg from './assets/2_place.svg'
import thirdLevelImg from './assets/3_place.svg'
import { LeaderListTableHead } from './LeaderListTableHead'

const leaderListTableSpecs = [
  { title: '#', size: { xs: 2, md: 1.5 } },
  { title: 'Player', size: { xs: 7.7, md: 8.7 } },
  { title: 'Points', size: { xs: 1.8, md: 1.8 } },
]

const placeImages = [firstLevelImg, secondLevelImg, thirdLevelImg]

interface LeaderListTableProps {
  leader: LeaderBoardRowProps[]
}

export const LeaderListTable: FC<LeaderListTableProps> = ({ leader }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <>
      {!isMobile && (
        <LeaderListTableHead>
          <Grid container minHeight="2.5em">
            {leaderListTableSpecs.map(prop => (
              <LeaderListTableCell {...prop.size} justifyContent="center">
                <Typography variant="body1" color={theme.palette.text.disabled}>
                  {prop.title}
                </Typography>
              </LeaderListTableCell>
            ))}
          </Grid>
        </LeaderListTableHead>
      )}
      <Grid container flexDirection="column" gap="0.5em">
        {leader.map(({ username, avatar, totalPoints, userPlace }, i) => (
          <LeaderListTableRow key={i} background={theme.palette.primary.lighter} width="100%">
            <Grid container>
              <LeaderListTableCell {...leaderListTableSpecs[0].size} justifyContent="center">
                {i < 3 ? (
                  <img src={placeImages[i]} alt="prize medal" />
                ) : (
                  <Typography display="flex" alignItems="center" minHeight="48px" variant="h4" whiteSpace="nowrap" overflow="auto">
                    {userPlace}
                  </Typography>
                )}
              </LeaderListTableCell>
              <LeaderListTableCell {...leaderListTableSpecs[1].size}>
                <Box display="flex" alignItems="center" minWidth="0">
                  {!isMobile && <Avatar src={avatar} size="small" />}
                  <Typography variant="h5" overflow="hidden" whiteSpace="nowrap" textOverflow="ellipsis" padding={theme.spacing(0, 4)}>
                    {username}
                  </Typography>
                </Box>
              </LeaderListTableCell>
              <LeaderListTableCell {...leaderListTableSpecs[2].size} justifyContent="center">
                <Typography variant="h4">{totalPoints}</Typography>
              </LeaderListTableCell>
            </Grid>
          </LeaderListTableRow>
        ))}
      </Grid>
    </>
  )
}

LeaderListTable.displayName = 'LeaderListTable'
