import type { FC } from 'react'
import { Box, Paper, Typography } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import { useCallback } from 'react'
import { useState } from 'react'
import { Tab, useMediaQuery, useTheme } from '@memebattle/ui'
import { Tabs } from 'shared/ui/Tabs'
import { LeaderListTable } from '../LeaderList'

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

interface LeaderBoardTabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

const LeaderBoardTabPanel: FC<LeaderBoardTabPanelProps> = ({ children, value, index, ...other }) => (
  <div role="tabpanel" hidden={value !== index} id={`leaderboard-tabpanel-${index}`} aria-labelledby={`leaderboard-tab-${index}`} {...other}>
    {value === index && children}
  </div>
)

const a11yProps = (index: number) => ({
  id: `leaderboard-tab-${index}`,
  'aria-controls': `leaderboard-tabpanel-${index}`,
})

const getTitles = (isMobile: boolean) => (!isMobile ? ['For day', 'For month', 'For all the time'] : ['Day', 'Month', 'All'])

export const LeaderBoard: FC<LeaderBoardProps> = ({ leaders }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const [activeTab, setActiveTab] = useState(0)

  const handleTabChange = useCallback((event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue)
  }, [])

  return (
    <StyledLeaderBoard>
      <Box textAlign="center" marginBottom={{ xs: '1.5rem', sm: '2.5rem' }}>
        <Typography component="h2" variant="h4" fontWeight="500">
          Leaders
        </Typography>
      </Box>
      <Tabs variant="fullWidth" value={activeTab} onChange={handleTabChange}>
        {getTitles(isMobile).map((title, index) => (
          <Tab label={title} {...a11yProps(index)} />
        ))}
      </Tabs>

      <LeaderBoardTabPanel value={activeTab} index={0}>
        <LeaderListTable leader={leaders.day} />
      </LeaderBoardTabPanel>
      <LeaderBoardTabPanel value={activeTab} index={1}>
        <LeaderListTable leader={leaders.month} />
      </LeaderBoardTabPanel>
      <LeaderBoardTabPanel value={activeTab} index={2}>
        <LeaderListTable leader={leaders.all} />
      </LeaderBoardTabPanel>
    </StyledLeaderBoard>
  )
}
