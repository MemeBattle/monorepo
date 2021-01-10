import type { BoxProps } from '@material-ui/core'
import { Box, createStyles, makeStyles } from '@material-ui/core'
import type { FC } from 'react'
import React from 'react'

type BgColors = 'main' | 'dark'

const useStyles = makeStyles(theme =>
  createStyles({
    background: {
      background: ({ bgColor }: { bgColor: BgColors }) => theme.palette.primary[bgColor],
    },
  }),
)

export const Background: FC<BoxProps & { bgColor?: BgColors }> = ({ children, bgColor, ...props }) => {
  const classes = useStyles({ bgColor: bgColor || 'main' })

  return (
    <Box className={classes.background} {...props}>
      {children}
    </Box>
  )
}
