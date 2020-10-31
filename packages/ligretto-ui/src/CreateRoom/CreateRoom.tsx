import React from 'react'
import { createStyles, makeStyles } from '@material-ui/core'
import { Paper, TextField, Button, Grid, Hidden, Box } from '@material-ui/core'

export interface CreateRoomProps {
  onRoomNameChange: React.ChangeEventHandler<HTMLInputElement>;
  onCreateClick: () => void
}

const useStyles = makeStyles(theme =>
  createStyles({
    createRoom: {
      width: '100%',
      borderRadius: 12,
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      [theme.breakpoints.up('lg')]: {
        maxWidth: '700px'
      },
    },
    roomNameRow: {
      display: 'inline-flex',
    },
    roomNameLabel: {
      fontSize: '2rem',
      fontWeight: 'bold',
      color: theme.palette.grey[700],
    },
  }),
)

export const CreateRoom: React.FC<CreateRoomProps> = ({onCreateClick, onRoomNameChange}) => {
  const classes = useStyles()

  return (
    <Paper className={classes.createRoom}>
      <Grid container>
        <Hidden only={'xs'}>
          <Grid sm={6} container justify="center" item>
            <span className={classes.roomNameLabel}>Room name:</span>
          </Grid>
        </Hidden>
        <Grid xs={12} sm={6} item>
          <TextField onChange={onRoomNameChange} fullWidth label="Room name" variant="outlined" placeholder="Tomsk" />
        </Grid>
      </Grid>
      <Box mt="2rem">
        <Grid container justify="center">
          <Grid item xs={12} sm={8} md={6}>
            <Button onClick={onCreateClick} variant="contained" color="primary" fullWidth size="large">
              Create
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

CreateRoom.displayName = 'CreateRoom'
