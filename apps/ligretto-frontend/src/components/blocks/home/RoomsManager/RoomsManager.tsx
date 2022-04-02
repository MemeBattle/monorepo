import React from 'react'
import { Box, Grid, Paper, Typography, useMediaQuery, useTheme } from '@memebattle/ui'
import { styled } from '@mui/material/styles'

import { RoomsListContainer } from 'containers/RoomsListContainer'
import { CreateRoomContainer } from 'containers/CreateRoomContainer'
import { SearchRoomsContainer } from 'containers/SearchRoomsContainer/SearchRoomsContainer'

const StyledRoomManagerWrapper = styled(Paper)(({ theme }) => ({
  maxWidth: theme.spacing(160),
  padding: theme.spacing(5, 8),
  borderRadius: '0.5rem !important',
  [theme.breakpoints.down('md')]: {
    width: theme.spacing(74),
    padding: theme.spacing(5, 5),
  },
  [theme.breakpoints.down('sm')]: {
    width: theme.spacing(43),
    padding: theme.spacing(5, 2.5),
  },
}))

export const RoomsManager = () => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const isTablet = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <StyledRoomManagerWrapper>
      <Grid container rowSpacing={1} columnSpacing={4} direction={isMobile ? 'column-reverse' : 'row'}>
        <Grid item xs={6} marginBottom={isMobile ? '1rem' : 0}>
          <Box textAlign="center" marginBottom={isMobile ? '1.5rem' : '2.5rem'}>
            <Typography component="h2" variant="h4">
              Enter to room
            </Typography>
          </Box>
          <SearchRoomsContainer />
        </Grid>
        <Grid item xs={6} marginBottom="2rem">
          <Box textAlign="center" marginBottom={isMobile ? '1.5rem' : '2.5rem'}>
            <Typography component="h2" variant="h4">
              Create new room
            </Typography>
          </Box>
          <CreateRoomContainer />
        </Grid>
      </Grid>
      <Box height={isMobile ? '12.25rem' : isTablet ? '16.5rem' : '24.5rem'}>
        <RoomsListContainer />
      </Box>
    </StyledRoomManagerWrapper>
  )
}
