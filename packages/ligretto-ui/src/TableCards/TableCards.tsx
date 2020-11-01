import React, { Children } from 'react'
import { createStyles, makeStyles, Grid } from '@material-ui/core'

export interface TableCardsProps {}

const useStyles = makeStyles(
  createStyles({
    tableCards: {},
  }),
)

export const TableCards: React.FC<TableCardsProps> = ({ children }) => {
  const classes = useStyles()

  return (
    <Grid container justify="center" spacing={1}>
      {Children.map(children, (child) => (
        <Grid item>{child}</Grid>
      ))}
    </Grid>)
}

TableCards.displayName = 'TableCards'
