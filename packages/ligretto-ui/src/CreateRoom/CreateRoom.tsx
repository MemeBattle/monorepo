import React from 'react'
import { createStyles, makeStyles } from '@material-ui/core'
import { Paper, Grid, Hidden, Box, Button } from '@material-ui/core'
import { Input } from 'Input/index'
import { Form, Field } from 'react-final-form'

export interface CreateRoomProps {
  onCreateClick: (e: {}) => void
  roomErrors: { error?: string }
}

export interface RegisterFormValues {
  roomname: string
}

const ROOM_MAX_LENGTH = 20

const useRoomNameValidation = () => (values: RegisterFormValues) => {
  const requiredLetters: RegExp = new RegExp('[A-Za-z0-9-Яа-яЁё]')
  const hasRequiredLetters = requiredLetters[Symbol.match](values.roomname)

  const hasMaxlength: boolean = values?.roomname?.length > ROOM_MAX_LENGTH

  if (values?.roomname && !hasRequiredLetters) {
    return { roomname: 'Must contain at least one number or letter' }
  }

  if (hasMaxlength) {
    return { roomname: 'Max lenght 20 caracters' }
  }
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

export const CreateRoom: React.FC<CreateRoomProps> = ({ onCreateClick, roomErrors }) => {
  const classes = useStyles()

  const validate = useRoomNameValidation()
  const initialValues = { roomname: '' }

  return (
    <Form<RegisterFormValues>
      initialValues={initialValues}
      onSubmit={onCreateClick}
      validate={validate}
      render={({ handleSubmit }) => (
        <form onSubmit={handleSubmit} autoComplete="off">
          <Paper className={classes.createRoom}>
            <Grid container>
              <Hidden only={'xs'}>
                <Grid sm={6} container justify="center" item>
                  <span className={classes.roomNameLabel}>Room name:</span>
                </Grid>
              </Hidden>
              <Grid xs={12} sm={6} item>
                <Field
                  name="roomname"
                  render={({ input, meta }) => {
                    return (
                      <Input
                        {...input}
                        variant="outlined"
                        required={true}
                        fullWidth
                        name="roomname"
                        label="Room name"
                        placeholder="Tomsk"
                        error={!!(meta.error && !meta.dirtySinceLastSubmit) || !!(roomErrors?.error && !meta.dirtySinceLastSubmit)}
                        helperText={meta.error || (roomErrors?.error && !meta.dirtySinceLastSubmit && 'Room already exists')}
                      />
                    )
                  }}
                />
              </Grid>
            </Grid>
            <Box mt="2rem">
              <Grid container justify="center">
                <Grid item xs={12} sm={8} md={6}>
                  <Button type="submit" variant="contained" color="primary" fullWidth size="large">
                    Create
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </form>
      )}
    />
  )
}

CreateRoom.displayName = 'CreateRoom'
