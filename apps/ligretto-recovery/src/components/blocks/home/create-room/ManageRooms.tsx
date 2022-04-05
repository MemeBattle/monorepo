import React from 'react'
import { Paper, RoomsList, Grid, Typography, Box, Input, Button } from '@memebattle/ligretto-ui'

const mockRooms = [
  {
    onClick: () => {},
    name: 'Room test',
    id: '123df',
    playersCount: 2,
    playersMaxCount: 4,
    isDisabled: false,
  },
  {
    onClick: () => {},
    name: 'Room test 2',
    id: 'rrr',
    playersCount: 3,
    playersMaxCount: 4,
    isDisabled: true,
  },
  {
    onClick: () => {},
    name: 'Room test 3',
    id: 'fdsf',
    playersCount: 4,
    playersMaxCount: 4,
    isDisabled: false,
  },
]

export const ManageRooms = () => (
  <Paper>
    <Grid container style={{ marginTop: '2rem' }}>
      <Grid container item xs={6} justify="center">
        <Box>
          <Typography variant={'h3'}>Enter to room</Typography>
          <Input variant={'outlined'} />
          <Button variant={'contained'}>Find</Button>
        </Box>
      </Grid>
      <Grid container item xs={6} justify="center">
        <Box>
          <Typography variant={'h3'}>Create new room</Typography>
          <Input variant={'outlined'} />
          <Button variant={'contained'}>Create</Button>
        </Box>
      </Grid>
      <Grid container item xs={12} justify="center" style={{ marginTop: '1rem' }}>
        <RoomsList rooms={mockRooms} />
      </Grid>
    </Grid>
  </Paper>
)
