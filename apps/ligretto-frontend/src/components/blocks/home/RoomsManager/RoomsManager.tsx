import React, { useEffect } from 'react'
import { Box, Grid, Paper, Typography } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import { useDispatch } from 'react-redux'

import { RoomsListContainer } from 'containers/RoomsListContainer'
import { CreateRoomContainer } from 'containers/CreateRoomContainer'
import { SearchRoomsContainer } from 'containers/SearchRoomsContainer/SearchRoomsContainer'
import { searchRoomsAction } from 'ducks/rooms'

const StyledRoomManager = styled(Paper)(({ theme }) => ({
  maxWidth: '80rem',
  padding: '2.5rem 4rem',
  [theme.breakpoints.down('md')]: {
    width: '37rem',
    padding: '2.5rem 2.5rem',
  },
  [theme.breakpoints.down('sm')]: {
    width: '21.5rem',
    padding: '2.5rem 1.25rem',
  },
}))

export const RoomsManager = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(searchRoomsAction({ search: '' }))
  }, [dispatch])

  return (
    <StyledRoomManager>
      <Grid container rowSpacing={1} columnSpacing={4} direction={{ xs: 'column-reverse', sm: 'row' }}>
        <Grid item xs={6} marginBottom={{ xs: '1rem', sm: 0 }}>
          <Box textAlign="center" marginBottom={{ xs: '1.5rem', sm: '2.5rem' }}>
            <Typography component="h2" variant="h4">
              Enter to room
            </Typography>
          </Box>
          <SearchRoomsContainer />
        </Grid>
        <Grid item xs={6} marginBottom="2rem">
          <Box textAlign="center" marginBottom={{ xs: '1.5rem', sm: '2.5rem' }}>
            <Typography component="h2" variant="h4">
              Create new room
            </Typography>
          </Box>
          <CreateRoomContainer />
        </Grid>
      </Grid>
      <Box height={{ xs: '12.25rem', sm: '16.5rem', md: '24.5rem' }}>
        <RoomsListContainer />
      </Box>
    </StyledRoomManager>
  )
}
