import { Box, createStyles, makeStyles, BoxProps } from '@material-ui/core'
import React, { FC } from 'react'

const useStyles = makeStyles(
  (theme) =>
    createStyles({
      background: {
        background: theme.palette.primary.main,
      },
    }),
)

export const Background: FC<BoxProps> = ({children, ...props}) => {

  const classes = useStyles()

  return <Box className={classes.background} {...props}>{children}</Box>
}
