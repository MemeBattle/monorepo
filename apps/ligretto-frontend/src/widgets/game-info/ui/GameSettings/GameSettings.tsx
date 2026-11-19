import type { FC, ReactNode } from 'react'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import PauseCircleOutlinedIcon from '@mui/icons-material/PauseCircleOutlined'
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import StyleOutlinedIcon from '@mui/icons-material/StyleOutlined'
import { Box, Button, Paper, Stack, Typography } from '@memebattle/ui'
import { alpha, styled } from '@mui/material/styles'

import { PlayersScoresTable } from '#features/player-scores-table'
import { GameStatus } from '@memebattle/ligretto-shared'

import { SpectatorsList } from '../SpectatorsList/SpectatorsList'

interface GameSettingsProps {
  gameStatus: GameStatus
  gameName: string
  playersCount: number
  playersMaxCount: number
  /** The viewer is the host, who starts and resumes rounds */
  canStartGame: boolean
  /** The viewer is a seated player between rounds */
  canToggleReady: boolean
  isStartDisabled: boolean
  isPlayerReadyToPlay: boolean
  onStartClick: () => void
  onReadyClick: () => void
  onExitClick: () => void
}

const StyledPaper = styled(Paper)(({ theme }) => ({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  gap: theme.spacing(3),
  padding: theme.spacing(4),
  backgroundColor: theme.palette.background.default,
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
  },
}))

const StyledExitIcon = styled(ExitToAppIcon)(() => ({
  transform: 'rotate(180deg)',
}))

const roundStateByStatus: Partial<Record<GameStatus, { label: string; icon: ReactNode }>> = {
  [GameStatus.Pause]: { label: 'Round is paused', icon: <PauseCircleOutlinedIcon sx={{ fontSize: '1rem' }} /> },
  [GameStatus.RoundFinished]: { label: 'Round finished', icon: <StyleOutlinedIcon sx={{ fontSize: '1rem' }} /> },
}

const InfoChip: FC<{ icon: ReactNode; children: ReactNode }> = ({ icon, children }) => (
  <Box
    display="inline-flex"
    alignItems="center"
    sx={{ gap: 1, px: 2, py: 1, borderRadius: 999, bgcolor: theme => alpha(theme.palette.common.black, 0.2) }}
  >
    {icon}
    <Typography variant="body2" fontWeight={700} noWrap>
      {children}
    </Typography>
  </Box>
)

export const GameSettings = ({
  gameStatus,
  gameName,
  playersCount,
  playersMaxCount,
  canStartGame,
  canToggleReady,
  isStartDisabled,
  isPlayerReadyToPlay,
  onReadyClick,
  onStartClick,
  onExitClick,
}: GameSettingsProps) => {
  const roundState = roundStateByStatus[gameStatus]

  return (
    <StyledPaper data-test-id="GameSettings">
      <Box display="flex" flexWrap="wrap" alignItems="flex-end" justifyContent="space-between" sx={{ gap: 2 }}>
        <Box minWidth={0}>
          <Typography component="h4" variant="h4" fontWeight={800} noWrap title={gameName}>
            {gameName}
          </Typography>
        </Box>
        <Box display="flex" flexWrap="wrap" sx={{ gap: 1 }}>
          {roundState && <InfoChip icon={roundState.icon}>{roundState.label}</InfoChip>}
          <InfoChip icon={<PeopleOutlinedIcon sx={{ fontSize: '1rem' }} />}>
            {playersCount}/{playersMaxCount} players
          </InfoChip>
        </Box>
      </Box>

      <PlayersScoresTable />

      <SpectatorsList />

      <Stack
        direction={{ xs: 'column-reverse', sm: 'row' }}
        useFlexGap
        spacing={2}
        sx={{
          alignItems: { xs: 'stretch', sm: 'center' },
          mt: 'auto',
          pt: 3,
          borderTop: theme => `1px solid ${alpha(theme.palette.common.white, 0.15)}`,
        }}
      >
        <Button
          onClick={onExitClick}
          size="large"
          variant="outlined"
          color="inherit"
          startIcon={<StyledExitIcon />}
          data-test-id="GameSettings-ExitButton"
        >
          Leave room
        </Button>
        <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
        {canToggleReady && (
          <Button
            onClick={onReadyClick}
            size="large"
            variant="outlined"
            color="inherit"
            sx={{ borderWidth: 2, '&:hover': { borderWidth: 2 } }}
            data-test-id="GameSettings-ReadyButton"
          >
            {isPlayerReadyToPlay ? 'Not ready' : "I'm ready"}
          </Button>
        )}
        {canStartGame && (
          <Button
            disabled={isStartDisabled}
            onClick={onStartClick}
            size="large"
            variant="contained"
            color="secondary"
            startIcon={<PlayArrowRoundedIcon />}
            sx={{
              px: 4,
              fontWeight: 800,
              boxShadow: theme => `0 4px 16px ${alpha(theme.palette.secondary.main, 0.4)}`,
              '&:hover': { boxShadow: theme => `0 6px 20px ${alpha(theme.palette.secondary.main, 0.55)}` },
              '&.Mui-disabled': { color: 'text.disabled', bgcolor: 'background.lighter', boxShadow: 'none' },
            }}
            data-test-id="GameSettings-StartButton"
          >
            {gameStatus === GameStatus.Pause ? 'Resume' : 'Start'}
          </Button>
        )}
      </Stack>
    </StyledPaper>
  )
}
