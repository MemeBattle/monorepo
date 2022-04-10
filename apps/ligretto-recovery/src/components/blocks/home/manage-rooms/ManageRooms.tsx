import React from 'react'
import { Box, Grid, InputWithButton, Paper, RoomsList, Typography } from '@memebattle/ligretto-ui'
import { InputWithButtonTypes } from '@memebattle/ligretto-shared'

import styles from './ManageRooms.module.scss'

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
  <Paper className={styles.manageRoomsWrapper}>
    <Grid container justify="center">
      <Grid container item xs={6} justify="center">
        <Box className={styles.header}>
          <Typography component="h2" variant="h4">
            Enter to room
          </Typography>
        </Box>
        <InputWithButton type={InputWithButtonTypes.search} />
      </Grid>
      <Grid container item xs={6} justify="center">
        <Box className={styles.header}>
          <Typography className={styles.header} component="h2" variant="h4">
            Create new room
          </Typography>
        </Box>
        <InputWithButton type={InputWithButtonTypes.createRoom} />
      </Grid>
      <Grid container item xs={12} justify="center" style={{ marginTop: '1rem' }}>
        <RoomsList rooms={mockRooms} />
      </Grid>
    </Grid>
  </Paper>
)
