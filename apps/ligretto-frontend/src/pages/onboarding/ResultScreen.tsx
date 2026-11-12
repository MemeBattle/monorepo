import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import { useDispatch, useSelector } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { Box, Button, Grid, Modal, Paper, Slide, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { styled } from '@mui/material/styles'

import { ONBOARDING_PLAYER_NAMES, onboardingGameSelector, onboardingResultsSelector, restartOnboardingAction } from '#features/onboarding'
import { routes } from '#shared/constants/router-constants'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'
import { Avatar } from '#shared/ui/Avatar'
import { NameBadge } from '#shared/ui/NameBadge'
import { columnsProps } from '#features/player-scores-table/ui/columnsProps'
import { formatRoundPoints } from '#features/player-scores-table/ui/formatRoundPoints'
import { PlayersScoresTableCell } from '#features/player-scores-table/ui/PlayersScoresTableCell'
import { PlayersScoresTableHeader } from '#features/player-scores-table/ui/PlayersScoresTableHeader'
import { PlayersScoresTableRow } from '#features/player-scores-table/ui/PlayersScoresTableRow'

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
    roundScore: results[player.id]?.roundScore ?? 0,
    gameScore: results[player.id]?.gameScore ?? 0,
    isViewer: player.id === 'id0',
  }))
})

/** The game's own table reads the live room, which onboarding does not have. */
const ResultRow = ({ username, avatar, roundScore, gameScore, isViewer }: ReturnType<typeof resultPlayersSelector>[number]) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <PlayersScoresTableRow sx={{ bgcolor: isViewer ? 'primary.main' : 'background.lighter' }}>
      <Grid container spacing={2} sx={{ flex: 1 }}>
        {!isMobile && (
          <PlayersScoresTableCell size={columnsProps.avatar}>
            <Avatar src={avatar} size="small" />
          </PlayersScoresTableCell>
        )}
        <PlayersScoresTableCell size={columnsProps.name} sx={{ gap: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={600} noWrap title={username}>
            {username}
          </Typography>
          {isViewer && <NameBadge>You</NameBadge>}
        </PlayersScoresTableCell>
        <PlayersScoresTableCell size={columnsProps.round} sx={{ justifyContent: 'flex-end' }}>
          <Typography fontWeight={500} variant="h6" sx={{ color: roundScore < 0 ? 'warning.main' : 'text.primary' }}>
            {formatRoundPoints(roundScore)}
          </Typography>
        </PlayersScoresTableCell>
        <PlayersScoresTableCell size={columnsProps.total} sx={{ justifyContent: 'flex-end' }}>
          <Typography fontWeight={800} variant="h5">
            {gameScore}
          </Typography>
        </PlayersScoresTableCell>
      </Grid>
    </PlayersScoresTableRow>
  )
}

export function ResultScreen() {
  const players = useSelector(resultPlayersSelector)
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const handleFinish = useCallback(() => {
    navigate(routes.HOME)
  }, [navigate])

  const handleReplay = useCallback(() => {
    dispatch(restartOnboardingAction())
  }, [dispatch])

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
              <Box flex={1} flexDirection="column" overflow="auto" data-test-id="PlayersScoresTable">
                <PlayersScoresTableHeader />
                {players.map(player => (
                  <ResultRow key={player.id} {...player} />
                ))}
              </Box>
              <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2 }}>
                <Button data-test-id="OnboardingPage-ReplayButton" variant="outlined" color="inherit" size="large" onClick={handleReplay}>
                  Пройти обучение ещё раз
                </Button>
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
