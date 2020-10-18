import React from 'react'
import { ResultsTable } from './ResultsTable'
import { createStyles, makeStyles } from '@material-ui/core'

export default {
  title: 'ResultsTable',
}

const players = [
  { position: 1, username: 'ThemeZV', roundPoints: 12, totalPoints: 22 },
  { position: 2, username: 'ThemeZV2', roundPoints: -4, totalPoints: 20 },
  { position: 3, username: 'ThemeZV3', roundPoints: 0, totalPoints: 8 },
  { position: 4, username: 'ThemeZV4', roundPoints: 1, totalPoints: 2 },
]

const useStyles = makeStyles(theme =>
  createStyles({
    background: {
      background: theme.palette.primary.dark,
      padding: '4rem',
    },
  }),
)

export const DefaultView = () => {
  const classes = useStyles()

  return (
    <div className={classes.background}>
      <ResultsTable players={players} />
    </div>
  )
}
