import React from 'react'
import { createStyles, makeStyles } from '@material-ui/core'
import { Paper, TextField, Button, Grid, Hidden, Box } from '@material-ui/core'

export interface CreateRoomProps {
  onRoomNameChange: React.ChangeEventHandler<HTMLInputElement>
  onCreateClick: () => void
  validationErrors: {
    error?: string
  } | null
  isCreateButtonDisabled?: boolean
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
        maxWidth: '700px',
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

export const CreateRoom: React.FC<CreateRoomProps> = ({ onCreateClick, onRoomNameChange, validationErrors, isCreateButtonDisabled }) => {
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
          <TextField
            required
            onChange={onRoomNameChange}
            fullWidth
            inputProps={{ minLength: 1 }}
            label="Room name"
            variant="outlined"
            placeholder="Tomsk"
            error={validationErrors ? true : false}
            helperText={validationErrors?.error}
          />
        </Grid>
      </Grid>
      <Box mt="2rem">
        <Grid container justify="center">
          <Grid item xs={12} sm={8} md={6}>
            <Button
              onClick={onCreateClick}
              disabled={isCreateButtonDisabled || !!validationErrors}
              variant="contained"
              color="primary"
              fullWidth
              size="large"
            >
              Create
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

CreateRoom.displayName = 'CreateRoom'
