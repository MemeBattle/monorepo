import React from 'react'
import type { PaperProps as MUIPaperProps } from '@material-ui/core'
import { createStyles, makeStyles, Paper as MUIPaper } from '@material-ui/core'

export type PaperProps = MUIPaperProps
const useStyles = makeStyles(() =>
  createStyles({
    root: {
      boxShadow: '0px 0px 32px rgba(0, 0, 0, 0.15)',
    },
    rounded: {
      borderRadius: '16px',
    },
  }),
)

export const Paper = (props: PaperProps) => {
  const classes = useStyles()
  return <MUIPaper classes={classes} {...props} />
}
