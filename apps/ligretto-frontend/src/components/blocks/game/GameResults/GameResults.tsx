import React from 'react'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import { Box, Button, Paper, Stack, Typography } from '@memebattle/ui'

import { GameResultsTableContainer } from 'containers/game-results-table/GameResultsTableContainer'

interface GameResultsProps {
  onReadyClick: () => void
  onExitClick: () => void
}

export const GameResults = ({ onReadyClick, onExitClick }: GameResultsProps) => (
  <Paper>
    <Box padding={4}>
      <Box display="flex" justifyContent="center" marginBottom={3}>
        <Typography component="h4" variant="h4" fontWeight="bold" whiteSpace="nowrap" overflow="auto">
          Round results
        </Typography>
      </Box>
      <GameResultsTableContainer />
      <Box marginTop={2}>
        <Stack direction="row" flex={1} justifyContent="space-between" spacing={{ xs: 5, md: 12 }}>
          <Button onClick={onExitClick} size="large" variant="contained" fullWidth startIcon={<ExitToAppIcon />}>
            <Typography variant="button">Exit</Typography>
          </Button>
          <Button onClick={onReadyClick} size="large" variant="contained" fullWidth>
            <Typography variant="button" fontWeight={500}>
              Ready
            </Typography>
          </Button>
        </Stack>
      </Box>
    </Box>
  </Paper>
)
