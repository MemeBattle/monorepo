import { useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useSelector } from 'react-redux'
import { Box, Button, Modal, Paper, Slide, Typography } from '@memebattle/ui'
import { styled } from '@mui/material/styles'

import { OnboardingStep, onboardingGameSelector, onboardingResultsSelector, onboardingStepSelector } from '#features/onboarding'
import { routes } from '#shared/constants/router-constants'
import { OnboardingArrow } from '#shared/ui/OnboardingArrow'
import { PlayersScoresTable } from '#features/player-scores-table/ui/PlayersScoresTable'

const StyledPaper = styled(Paper)(({ theme }) => ({
  display: 'flex',
  flex: '1',
  flexDirection: 'column',
  padding: theme.spacing(4),
}))

export function ResultScreen() {
  const step = useSelector(onboardingStepSelector)
  const game = useSelector(onboardingGameSelector)
  const results = useSelector(onboardingResultsSelector)
  const navigate = useNavigate()

  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)

  const handleFinish = useCallback(() => {
    navigate(routes.HOME)
  }, [navigate])

  const players = useMemo(() => {
    if (!results) return []
    return Object.values(game.players).map(player => {
      const totalPoints = results[player.id]?.gameScore ?? 0
      const roundPoints = [results[player.id]?.roundScore ?? 0]
      return {
        id: player.id,
        username: player.id === 'id0' ? 'you' : player.id,
        roundPoints,
        totalPoints,
        isPlayer: player.id === 'id0',
      }
    })
  }, [game.players, results])

  if (step !== OnboardingStep.Result) {
    return null
  }

  return (
    <Modal open>
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <Box
          ref={bubbleRef}
          sx={{
            position: 'absolute',
            maxWidth: 'min(36rem, calc(100vw - 32px))',
            px: 2,
            zIndex: 5,
            pointerEvents: 'none',
            left: '2rem',
            top: '4rem',
          }}
        >
          <Typography fontSize="1.1rem" variant="body1" fontWeight="bold" color="#fff">
            Поздравляем! Ты победил! За каждую выложенную карту на общий стол, игрок получает +1 очко. На конец раунда из суммы заработанных очков
            вычитается количество карт, оставшихся в колоде ligretto умноженное на 2.
          </Typography>
        </Box>

        <OnboardingArrow from={bubbleRef} to={modalRef} />

        <Slide direction="down" mountOnEnter unmountOnExit in>
          <Box display="flex" height="100%" alignItems="center" justifyContent="center">
            <Box
              ref={modalRef}
              padding={1}
              display="flex"
              minHeight="min(44rem, 100vh)"
              maxHeight="100%"
              width="64rem"
              minWidth="min-content"
              maxWidth="100%"
            >
              <StyledPaper>
                <Box display="flex" justifyContent="center" sx={{ mb: 3 }}>
                  <Typography component="h4" variant="h4" fontWeight="bold">
                    Раунд 1. Результаты
                  </Typography>
                </Box>
                <PlayersScoresTable players={players} />
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                  <Button variant="contained" size="large" onClick={handleFinish}>
                    Закончить обучение
                  </Button>
                </Box>
              </StyledPaper>
            </Box>
          </Box>
        </Slide>
      </Box>
    </Modal>
  )
}
