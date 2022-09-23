import React, { Children } from 'react'
import Grid from '@mui/material/Grid'

export const TableCards: React.FC = ({ children }) => (
  <Grid container justifyContent="center" spacing={1}>
    {Children.map(children, (child, index) => (
      <Grid key={index} item>
        {child}
      </Grid>
    ))}
  </Grid>
)

TableCards.displayName = 'TableCards'
