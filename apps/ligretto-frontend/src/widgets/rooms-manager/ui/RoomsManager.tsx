import { useEffect } from 'react'
import { Box, Grid, Paper, Typography } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import { useDispatch } from 'react-redux'

import { CreateRoomContainer } from '#features/create-room'
import { SearchRoomsContainer, RoomsListContainer } from '#features/search-rooms'
import { getRoomsAction } from '#ducks/rooms'

const StyledRoomManager = styled(Paper)(({ theme }) => ({
  padding: '2.5rem 4rem',
  [theme.breakpoints.down('md')]: {
    padding: '2.5rem 2.5rem',
  },
  [theme.breakpoints.down('sm')]: {
    padding: '2.5rem 1.25rem',
  },
}))

export const RoomsManager = () => {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(getRoomsAction())
  }, [dispatch])

  return (
    <StyledRoomManager>
      <Grid container rowSpacing={1} columnSpacing={4} direction={{ xs: 'column-reverse', sm: 'row' }}>
        <Grid item xs={6} marginBottom={{ xs: '1rem', sm: 0 }}>
          <Box textAlign="center" marginBottom={{ xs: '1.5rem', sm: '2.5rem' }}>
            <Typography component="h2" variant="h4" fontWeight="500">
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
      <RoomsListContainer />
    </StyledRoomManager>
  )
}
