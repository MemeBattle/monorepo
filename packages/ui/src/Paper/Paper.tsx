import React from 'react'
import type { PaperProps as MUIPaperProps } from '@mui/material'
import { Paper as MUIPaper } from '@mui/material'

import { createStyles, makeStyles } from '@mui/styles'

export type PaperProps = MUIPaperProps
const useStyles = makeStyles(() =>
  createStyles({
    root: {
      boxShadow: '0px 0px 32px rgba(0, 0, 0, 0.15)',
    },
    rounded: {
      borderRadius: '8px',
    },
  }),
)

export const Paper = (props: PaperProps) => {
  const classes = useStyles()
  return <MUIPaper classes={classes} {...props} />
}
