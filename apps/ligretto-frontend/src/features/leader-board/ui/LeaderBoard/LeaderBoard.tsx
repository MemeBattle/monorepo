import type { FC } from 'react'
import { Box, Paper, Typography } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import { LeaderListContainer } from '../LeaderListContainer'

const StyledLeaderBoard = styled(Paper)(({ theme }) => ({
  padding: '2.5rem 4rem',
  [theme.breakpoints.down('md')]: {
    padding: '2.5rem 2.5rem',
  },
  [theme.breakpoints.down('sm')]: {
    padding: '2.5rem 1.25rem',
  },
}))

export interface LeaderBoardRowProps {
  username: string
  avatar?: string
  totalPoints: number
  userPlace?: number
}

export interface LeaderBoardProps {
  leaders: {
    day: LeaderBoardRowProps[]
    month: LeaderBoardRowProps[]
    all: LeaderBoardRowProps[]
  }
}

export const LeaderBoard: FC<LeaderBoardProps> = ({ leaders }) => (
  <StyledLeaderBoard>
    <Box textAlign="center" marginBottom={{ xs: '1.5rem', sm: '2.5rem' }}>
      <Typography component="h2" variant="h4" fontWeight="500">
        Leaders
      </Typography>
    </Box>
    <LeaderListContainer leaders={leaders} />
  </StyledLeaderBoard>
)
