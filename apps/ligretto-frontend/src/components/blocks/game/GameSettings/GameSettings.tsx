import React, { useMemo } from 'react'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import { Box, Button, Paper, Stack, Typography } from '@memebattle/ui'

import { PlayersScoresTableContainer } from 'containers/PlayersScoresTable/PlayersScoresTableContainer'
import { GameStatus } from '@memebattle/ligretto-shared'

interface GameSettingsProps {
  gameStatus: GameStatus
  gameName: string
  canStartGame: boolean
  onStartClick: () => void
  onReadyClick: () => void
  onExitClick: () => void
  isButtonDisabled: boolean
  isPlayerReadyToPlay: boolean
}

export const GameSettings = ({
  gameStatus,
  gameName,
  canStartGame,
  onReadyClick,
  onStartClick,
  onExitClick,
  isButtonDisabled,
  isPlayerReadyToPlay,
}: GameSettingsProps) => {
  const title = useMemo(() => {
    switch (gameStatus) {
      case GameStatus.New:
        return gameName
      case GameStatus.Pause:
        return 'Round is paused'
      case GameStatus.RoundFinished:
        return 'Round results'
    }
  }, [gameStatus, gameName])

  const buttonText: string = useMemo(() => {
    if (canStartGame) {
      return 'Start'
    }
    if (isPlayerReadyToPlay) {
      return 'Not ready'
    }
    return 'Ready'
  }, [canStartGame, isPlayerReadyToPlay])

  return (
    <Paper>
      <Box padding={4}>
        <Box display="flex" justifyContent="center" marginBottom={3}>
          <Typography component="h4" variant="h4" fontWeight="bold" whiteSpace="nowrap" overflow="auto">
            {title}
          </Typography>
        </Box>
        <PlayersScoresTableContainer />
        <Box marginTop={2}>
          <Stack direction="row" flex={1} justifyContent="space-between" spacing={{ xs: 5, md: 12 }}>
            <Button onClick={onExitClick} size="large" variant="contained" fullWidth startIcon={<ExitToAppIcon />}>
              <Typography variant="button">Exit</Typography>
            </Button>
            <Button disabled={isButtonDisabled} onClick={canStartGame ? onStartClick : onReadyClick} size="large" variant="contained" fullWidth>
              <Typography variant="button" fontWeight={500}>
                {buttonText}
              </Typography>
            </Button>
          </Stack>
        </Box>
      </Box>
    </Paper>
  )
}
