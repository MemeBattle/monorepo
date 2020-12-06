import React, { Children } from 'react'
import { Grid } from '@material-ui/core'

export const TableCards: React.FC = ({ children }) => (
  <Grid container justify="center" spacing={1}>
    {Children.map(children, (child, index) => (
      <Grid key={index} item>
        {child}
      </Grid>
    ))}
  </Grid>
)

TableCards.displayName = 'TableCards'
