import { Box, Paper, Typography } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import { LeaderListContainer } from 'containers/LeaderListContainer'

const StyledLeaderBoard = styled(Paper)(({ theme }) => ({
  padding: '2.5rem 4rem',
  [theme.breakpoints.down('md')]: {
    padding: '2.5rem 2.5rem',
  },
  [theme.breakpoints.down('sm')]: {
    padding: '2.5rem 1.25rem',
  },
}))

export const LeaderBoard = () => (
  <StyledLeaderBoard>
    <Box textAlign="center" marginBottom={{ xs: '1.5rem', sm: '2.5rem' }}>
      <Typography component="h2" variant="h4" fontWeight="500">
        Leaders
      </Typography>
    </Box>
    <LeaderListContainer />
  </StyledLeaderBoard>
)
