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
  leaders: Array<{ username: string; avatar?: string; totalPoints: number; id: string; userPlace: number }>
}

const columnsProps = {
  place: { xs: 2, md: 1.5 },
  name: { xs: 7.7, md: 8.7 },
  totalPoints: { xs: 1.8, md: 1.8 },
}

const placeImages = [firstLevelImg, secondLevelImg, thirdLevelImg]

export const LeaderListTable: FC<LeaderListTableProps> = ({ leaders }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Grid container flexDirection="column" data-test-id="LeaderListTable" gap="0.5em">
      {!isMobile && (
        <LeaderListTableHead>
          <Grid container minHeight="2.5em">
            <LeaderListTableCell {...columnsProps.place} justifyContent="center">
              <Typography variant="body1" color={theme.palette.text.disabled}>
                #
              </Typography>
            </LeaderListTableCell>
            <LeaderListTableCell {...columnsProps.name} justifyContent="center">
              <Typography variant="body1" color={theme.palette.text.disabled}>
                Player
              </Typography>
            </LeaderListTableCell>
            <LeaderListTableCell {...columnsProps.totalPoints} justifyContent="center">
              <Typography variant="body1" color={theme.palette.text.disabled}>
                Points
              </Typography>
            </LeaderListTableCell>
          </Grid>
        </LeaderListTableHead>
      )}
      {leaders.map(({ username, avatar, id, totalPoints, userPlace }, i) => (
        <LeaderListTableRow key={id} background={theme.palette.primary.lighter} data-test-id="LeaderListTableRow" width="100%">
          <Grid container data-test-id="LeaderListTableRowGrid">
            <LeaderListTableCell {...columnsProps.place} justifyContent="center">
              {i < 3 ? (
                <img src={placeImages[i]} alt="prize medal" />
              ) : (
                <Typography variant="h4" whiteSpace="nowrap" overflow="auto">
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
