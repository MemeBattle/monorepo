import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { Box, Button, Modal, Paper, Slide, Typography } from '@memebattle/ui'
import { styled } from '@mui/material/styles'

import { ONBOARDING_PLAYER_NAMES, onboardingGameSelector, onboardingResultsSelector } from '#features/onboarding'
import { routes } from '#shared/constants/router-constants'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'
import { PlayersScoresTable } from '#features/player-scores-table/ui/PlayersScoresTable'

const StyledPaper = styled(Paper)(({ theme }) => ({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  padding: theme.spacing(4),
}))

const resultPlayersSelector = createSelector([onboardingGameSelector, onboardingResultsSelector], (game, results) => {
  if (!results) {
    return []
  }

  return Object.values(game.players).map(player => ({
    id: player.id,
    username: ONBOARDING_PLAYER_NAMES[player.id as keyof typeof ONBOARDING_PLAYER_NAMES] ?? player.id,
    avatar: getRandomAvatar(player.id),
    roundPoints: [results[player.id]?.roundScore ?? 0],
    totalPoints: results[player.id]?.gameScore ?? 0,
    isPlayer: player.id === 'id0',
  }))
})

export function ResultScreen() {
  const players = useSelector(resultPlayersSelector)
  const navigate = useNavigate()

  const handleFinish = useCallback(() => {
    navigate(routes.HOME)
  }, [navigate])

  return (
    <Modal open>
      <Slide direction="down" mountOnEnter unmountOnExit in>
        <Box display="flex" height="100%" alignItems="center" justifyContent="center">
          <Box padding={1} display="flex" minHeight="min(44rem, 100vh)" maxHeight="100%" width="64rem" minWidth="min-content" maxWidth="100%">
            <StyledPaper>
              <Box display="flex" justifyContent="center">
                <Typography component="h4" variant="h4" fontWeight="bold">
                  Раунд 1. Результаты
                </Typography>
              </Box>
              <Typography variant="body1" fontSize="1.1rem" textAlign="center" sx={{ my: 3 }}>
                Поздравляем! Ты победил! За каждую выложенную карту на общий стол игрок получает +1 очко. В конце раунда из суммы заработанных очков
                вычитается количество карт, оставшихся в колоде Лигретто, умноженное на 2.
              </Typography>
              <PlayersScoresTable players={players} />
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button data-test-id="OnboardingPage-FinishButton" variant="contained" size="large" onClick={handleFinish}>
                  Закончить обучение
                </Button>
              </Box>
            </StyledPaper>
          </Box>
        </Box>
      </Slide>
    </Modal>
  )
}
