import React from 'react'
import { createStyles, makeStyles } from '@mui/styles'
import { Paper, TextField, Button, Grid, Hidden, Box, Switch } from '@mui/material'

export interface CreateRoomProps {
  onRoomNameChange: React.ChangeEventHandler<HTMLInputElement>
  onCreateClick: () => void
  validationErrors: {
    error?: string
  } | null
  isCreateButtonDisabled?: boolean
  dndEnabled?: boolean
  onChangeDndEnabled?: () => void
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
    },
  }),
)

export const CreateRoom: React.FC<CreateRoomProps> = ({
  onCreateClick,
  onRoomNameChange,
  validationErrors,
  isCreateButtonDisabled,
  dndEnabled,
  onChangeDndEnabled,
}) => {
  const classes = useStyles()

  return (
    <Paper className={classes.createRoom}>
      <Grid container>
        <Hidden only={'xs'}>
          <Grid sm={6} container justifyContent="center" item>
            <span className={classes.roomNameLabel}>Room name:</span>
          </Grid>
        </Hidden>
        <Grid xs={12} sm={6} item>
          <TextField
            required
            onChange={onRoomNameChange}
            fullWidth
            inputProps={{ minLength: 1, 'data-test-id': 'CreateGameInput' }}
            label="Room name"
            variant="outlined"
            placeholder="Tomsk"
            error={!!validationErrors}
            helperText={validationErrors?.error}
          />
        </Grid>
        <Grid xs={12} sm={6} item>
          Dnd? (experimental)
          <Switch onChange={onChangeDndEnabled} checked={dndEnabled} />
        </Grid>
      </Grid>
      <Box mt="2rem">
        <Grid container justifyContent="center">
          <Grid item xs={12} sm={8} md={6}>
            <Button
              data-test-id="CreateGameButton"
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
