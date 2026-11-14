import type { FC } from 'react'
import { Avatar } from '#shared/ui/Avatar'
import { Box, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import type { Leader } from '#shared/api'
import { userAvatarUrl, userLabel } from '#ducks/users'

import { LeaderListTableCell } from './LeaderListTableCell'
import { LeaderListTableHead, leaderListColumns } from './LeaderListTableHead'
import { LeaderListTableRow } from './LeaderListTableRow'

import firstPlaceImg from './assets/1_place.svg'
import secondPlaceImg from './assets/2_place.svg'
import thirdPlaceImg from './assets/3_place.svg'

const placeImages = [firstPlaceImg, secondPlaceImg, thirdPlaceImg]

const Medal = styled('img')(({ theme }) => ({
  width: '2rem',
  [theme.breakpoints.up('sm')]: {
    width: '3rem',
  },
}))

interface LeaderRowProps {
  leader: Leader
  isMe: boolean
}

const LeaderRow: FC<LeaderRowProps> = ({ leader, isMe }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const numberVariant = isMobile ? 'h5' : 'h4'
  // Only full accounts are ranked.
  const label = userLabel({ accountType: 'full', name: leader.name })

  return (
    <LeaderListTableRow bgcolor={isMe ? theme.palette.primary.light : theme.palette.primary.lighter}>
      <Grid container sx={{ minHeight: '3rem' }}>
        <LeaderListTableCell size={leaderListColumns.place} sx={{ justifyContent: 'center' }}>
          {leader.place <= 3 ? (
            <Medal src={placeImages[leader.place - 1]} alt={`Place ${leader.place}`} />
          ) : (
            <Typography variant={numberVariant}>{leader.place}</Typography>
          )}
        </LeaderListTableCell>
        <LeaderListTableCell size={leaderListColumns.player} sx={{ gap: { xs: 1, sm: 2 }, px: { xs: 1, sm: 2 } }}>
          {!isMobile && <Avatar src={userAvatarUrl(leader)} size="small" />}
          <Typography variant="h5" noWrap title={label}>
            {label}
          </Typography>
        </LeaderListTableCell>
        <LeaderListTableCell size={leaderListColumns.points} sx={{ justifyContent: 'center' }}>
          <Typography variant={numberVariant}>{leader.totalPoints}</Typography>
        </LeaderListTableCell>
      </Grid>
    </LeaderListTableRow>
  )
}

interface LeaderListTableProps {
  leaders: Leader[]
  /** The caller's own row; shown under the list when it ranks outside it. */
  me: Leader | null
}

export const LeaderListTable: FC<LeaderListTableProps> = ({ leaders, me }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const meOutsideList = me !== null && !leaders.some(leader => leader.sub === me.sub) ? me : null

  return (
    <>
      {!isMobile && <LeaderListTableHead />}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {leaders.map(leader => (
          <LeaderRow key={leader.sub} leader={leader} isMe={leader.sub === me?.sub} />
        ))}
        {meOutsideList && (
          <>
            <Typography aria-hidden textAlign="center" color={theme.palette.text.disabled}>
              ⋯
            </Typography>
            <LeaderRow leader={meOutsideList} isMe />
          </>
        )}
      </Box>
    </>
  )
}

LeaderListTable.displayName = 'LeaderListTable'
