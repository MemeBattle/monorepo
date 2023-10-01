import type { FC } from 'react'
import { Avatar } from 'shared/ui/Avatar'
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'

import { LeaderListTableCell } from './LeaderListTableCell'
import { LeaderListTableRow } from './LeaderListTableRow'
import type { LeaderBoardRowProps } from '../LeaderBoard/LeaderBoard'

import firstLevelImg from './assets/1_place.svg'
import secondLevelImg from './assets/2_place.svg'
import thirdLevelImg from './assets/3_place.svg'

const columnsProps = {
  place: { xs: 2, md: 1.5 },
  name: { xs: 7.7, md: 8.7 },
  totalPoints: { xs: 1.8, md: 1.8 },
}

const placeImages = [firstLevelImg, secondLevelImg, thirdLevelImg]

interface LeaderListTableProps {
  leader: LeaderBoardRowProps[]
}

export const LeaderListTable: FC<LeaderListTableProps> = ({ leader }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Grid container flexDirection="column" gap="0.5em">
      {leader.map(({ username, avatar, totalPoints, userPlace }, i) => (
        <LeaderListTableRow key={i} background={theme.palette.primary.lighter} width="100%">
          <Grid container>
            <LeaderListTableCell {...columnsProps.place} justifyContent="center">
              {i < 3 ? (
                <img src={placeImages[i]} alt="prize medal" />
              ) : (
                <Typography display="flex" alignItems="center" minHeight="48px" variant="h4" whiteSpace="nowrap" overflow="auto">
                  {userPlace}
                </Typography>
              )}
            </LeaderListTableCell>
            <LeaderListTableCell {...columnsProps.name}>
              <Box display="flex" alignItems="center" minWidth="0">
                {!isMobile && <Avatar src={avatar} size="small" />}
                <Typography variant="h5" overflow="hidden" whiteSpace="nowrap" textOverflow="ellipsis" padding={theme.spacing(0, 4)}>
                  {username}
                </Typography>
              </Box>
            </LeaderListTableCell>
            <LeaderListTableCell {...columnsProps.totalPoints} justifyContent="center">
              <Typography variant="h4">{totalPoints}</Typography>
            </LeaderListTableCell>
          </Grid>
        </LeaderListTableRow>
      ))}
    </Grid>
  )
}

LeaderListTable.displayName = 'LeaderListTable'
