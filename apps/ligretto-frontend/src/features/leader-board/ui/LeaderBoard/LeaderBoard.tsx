import type { FC } from 'react'
import { Suspense, useState, useTransition } from 'react'
import { useSelector } from 'react-redux'
import { QueryErrorResetBoundary, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Box, Button, Paper, Tab, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { styled } from '@mui/material/styles'

import { accessTokenSelector } from '#ducks/auth'
import type { LeadersPeriod } from '#shared/api'
import { ErrorBoundary } from '#shared/ui/ErrorBoundary'
import { Tabs } from '#shared/ui/Tabs'

import { leadersQueryKey, leadersQueryOptions } from '../../model/leadersQuery'
import { LeaderListSkeleton, LeaderListTable } from '../LeaderList'

const StyledLeaderBoard = styled(Paper)(({ theme }) => ({
  padding: '1.5rem 1rem',
  [theme.breakpoints.up('sm')]: {
    padding: '2.5rem',
  },
  [theme.breakpoints.up('md')]: {
    padding: '2.5rem 4rem',
  },
}))

const PERIODS = ['day', 'month', 'all'] as const satisfies LeadersPeriod[]

const titles: Record<LeadersPeriod, string> = { day: 'For day', month: 'For month', all: 'For all the time' }
const mobileTitles: Record<LeadersPeriod, string> = { day: 'Day', month: 'Month', all: 'All' }

const TAB_PANEL_ID = 'leaderboard-tabpanel'
const tabId = (period: LeadersPeriod) => `leaderboard-tab-${period}`

interface LeadersPanelProps {
  period: LeadersPeriod
  isPending: boolean
}

const LeadersPanel: FC<LeadersPanelProps> = ({ period, isPending }) => {
  const accessToken = useSelector(accessTokenSelector)
  const { data, isFetching } = useSuspenseQuery(leadersQueryOptions(period, accessToken))
  const isBusy = isPending || isFetching

  return (
    <Box aria-busy={isBusy} sx={{ opacity: isBusy ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      {data.leaders.length === 0 ? (
        <Typography textAlign="center" sx={{ py: 3 }}>
          No points in this period yet.
        </Typography>
      ) : (
        <LeaderListTable leaders={data.leaders} me={data.me} />
      )}
    </Box>
  )
}

const LeaderBoardError: FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 3 }}>
    <Typography>Could not load the leaders.</Typography>
    <Button variant="contained" onClick={onRetry}>
      Retry
    </Button>
  </Box>
)

export const LeaderBoard: FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const queryClient = useQueryClient()

  const [selectedPeriod, setSelectedPeriod] = useState<LeadersPeriod>('day')
  const [period, setPeriod] = useState<LeadersPeriod>('day')
  const [isPending, startTransition] = useTransition()

  const handleTabChange = (_: unknown, next: LeadersPeriod) => {
    const state = queryClient.getQueryState(leadersQueryKey(next))
    // A suspense query rethrows its cached error on mount, so a period that failed before is reset to be fetched again.
    if (state?.status === 'error' && state.data === undefined) {
      void queryClient.resetQueries({ queryKey: leadersQueryKey(next), exact: true })
    }
    setSelectedPeriod(next)
    startTransition(() => setPeriod(next))
  }

  return (
    <StyledLeaderBoard>
      <Box textAlign="center" sx={{ marginBottom: { xs: '1.5rem', sm: '2.5rem' } }}>
        <Typography component="h2" variant="h4" fontWeight="500">
          Leaders
        </Typography>
      </Box>
      <Tabs variant="fullWidth" value={selectedPeriod} onChange={handleTabChange} sx={{ mb: 2 }}>
        {PERIODS.map(tabPeriod => (
          <Tab
            key={tabPeriod}
            value={tabPeriod}
            label={isMobile ? mobileTitles[tabPeriod] : titles[tabPeriod]}
            id={tabId(tabPeriod)}
            aria-controls={TAB_PANEL_ID}
          />
        ))}
      </Tabs>
      <div role="tabpanel" id={TAB_PANEL_ID} aria-labelledby={tabId(selectedPeriod)}>
        <QueryErrorResetBoundary>
          {({ reset }) => (
            <ErrorBoundary resetKey={period} onReset={reset} fallback={({ reset: retry }) => <LeaderBoardError onRetry={retry} />}>
              <Suspense fallback={<LeaderListSkeleton />}>
                <LeadersPanel period={period} isPending={isPending} />
              </Suspense>
            </ErrorBoundary>
          )}
        </QueryErrorResetBoundary>
      </div>
    </StyledLeaderBoard>
  )
}

LeaderBoard.displayName = 'LeaderBoard'
