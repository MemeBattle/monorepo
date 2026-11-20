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

  const inviteCell = (
    <PlayersScoresTableCell size={{ xs: 12, sm: 'auto' }}>
      <RoomInviteLink />
    </PlayersScoresTableCell>
  )

  return (
    <PlayersScoresTableRow sx={{ border: `1px dashed ${alpha(theme.palette.common.white, 0.35)}` }} data-test-id="PlayersScoresTable-FreeSeat">
      <Grid container columnSpacing={2} rowSpacing={0} sx={{ flex: 1 }}>
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
        {!isMobile && inviteCell}
        {offersSeat && isSpectator && (
          <PlayersScoresTableCell size="auto">
            <Button
              onClick={handleTakeSeat}
              size={isMobile ? 'small' : 'medium'}
              variant="contained"
              color="secondary"
              startIcon={<ArrowForwardRoundedIcon />}
              sx={{ fontWeight: 800 }}
              data-test-id="PlayersScoresTable-TakeSeatButton"
            >
              Sit here
            </Button>
          </PlayersScoresTableCell>
        )}
        {/* On a phone the invite link takes the second line, under the label and Sit here, so the seat fits the fixed row height. */}
        {isMobile && inviteCell}
      </Grid>
    </PlayersScoresTableRow>
  )
}

FreeSeat.displayName = 'FreeSeat'
