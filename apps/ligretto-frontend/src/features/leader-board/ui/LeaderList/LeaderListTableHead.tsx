import { Box, Grid, Typography, useTheme } from '@memebattle/ui'

import { LeaderListTableCell } from './LeaderListTableCell'

/** The column sizes sum to 12 at every breakpoint. */
export const leaderListColumns = {
  place: { xs: 2, md: 1.5 },
  player: { xs: 7, md: 8.5 },
  points: { xs: 3, md: 2 },
} as const

const headCells = [
  { title: '#', size: leaderListColumns.place, justifyContent: 'center' },
  { title: 'Player', size: leaderListColumns.player, justifyContent: 'flex-start' },
  { title: 'Points', size: leaderListColumns.points, justifyContent: 'center' },
] as const

export const LeaderListTableHead = () => {
  const theme = useTheme()

  return (
    <Box sx={{ px: { xs: 1, sm: 2 }, py: 1 }}>
      <Grid container sx={{ minHeight: '2.5em' }}>
        {headCells.map(({ title, size, justifyContent }) => (
          <LeaderListTableCell key={title} size={size} sx={{ justifyContent }}>
            <Typography variant="body1" color={theme.palette.text.disabled}>
              {title}
            </Typography>
          </LeaderListTableCell>
        ))}
      </Grid>
    </Box>
  )
}

LeaderListTableHead.displayName = 'LeaderListTableHead'
