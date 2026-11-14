import { Box, useMediaQuery, useTheme } from '@memebattle/ui'
import Skeleton from '@mui/material/Skeleton'

import { LeaderListTableHead } from './LeaderListTableHead'

const ROWS = 5

export const LeaderListSkeleton = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Box role="progressbar" aria-label="Loading leaders">
      {!isMobile && <LeaderListTableHead />}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {Array.from({ length: ROWS }, (_, index) => (
          <Skeleton key={index} variant="rounded" height="4rem" />
        ))}
      </Box>
    </Box>
  )
}

LeaderListSkeleton.displayName = 'LeaderListSkeleton'
