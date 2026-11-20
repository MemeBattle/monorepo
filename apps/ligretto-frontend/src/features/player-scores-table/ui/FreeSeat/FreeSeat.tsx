import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import { Box, Button, Grid, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { alpha } from '@mui/material/styles'
import { becomePlayerEmitAction } from '@memebattle/ligretto-shared'

import { gameIdSelector, isPlayerSpectatorSelector } from '#ducks/game'

import { columnsProps } from '../columnsProps'
import { PlayersScoresTableCell } from '../PlayersScoresTableCell'
import { PlayersScoresTableRow } from '../PlayersScoresTableRow'
import { RoomInviteLink } from '../RoomInviteLink/RoomInviteLink'

export interface FreeSeatProps {
  offersSeat?: boolean
}

export const FreeSeat = ({ offersSeat = false }: FreeSeatProps) => {
  const dispatch = useDispatch()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const gameId = useSelector(gameIdSelector)
  const isSpectator = useSelector(isPlayerSpectatorSelector)

  const handleTakeSeat = useCallback(() => {
    dispatch(becomePlayerEmitAction({ gameId }))
  }, [dispatch, gameId])

  return (
    <PlayersScoresTableRow sx={{ border: `1px dashed ${alpha(theme.palette.common.white, 0.35)}` }} data-test-id="PlayersScoresTable-FreeSeat">
      <Grid container spacing={2} sx={{ flex: 1 }}>
        {!isMobile && (
          <PlayersScoresTableCell size={columnsProps.avatar}>
            <Box width="3rem" height="3rem" borderRadius="50%" border={`1px dashed ${alpha(theme.palette.common.white, 0.5)}`} />
          </PlayersScoresTableCell>
        )}
        <PlayersScoresTableCell size="grow">
          <Typography variant="body1" sx={{ opacity: 0.85 }}>
            Free seat
          </Typography>
        </PlayersScoresTableCell>
        <PlayersScoresTableCell size="auto">
          <RoomInviteLink isCompact={isMobile} />
        </PlayersScoresTableCell>
        {offersSeat && isSpectator && (
          <PlayersScoresTableCell size="auto">
            {isMobile ? (
              <Button
                onClick={handleTakeSeat}
                aria-label="Sit here"
                variant="contained"
                color="secondary"
                sx={{ minWidth: '2.75rem', height: '2.75rem', p: 0 }}
                data-test-id="PlayersScoresTable-TakeSeatButton"
              >
                <ArrowForwardRoundedIcon />
              </Button>
            ) : (
              <Button
                onClick={handleTakeSeat}
                variant="contained"
                color="secondary"
                startIcon={<ArrowForwardRoundedIcon />}
                sx={{ fontWeight: 800 }}
                data-test-id="PlayersScoresTable-TakeSeatButton"
              >
                Sit here
              </Button>
            )}
          </PlayersScoresTableCell>
        )}
      </Grid>
    </PlayersScoresTableRow>
  )
}

FreeSeat.displayName = 'FreeSeat'
