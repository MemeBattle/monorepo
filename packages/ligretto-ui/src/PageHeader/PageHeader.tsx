import React from 'react'
import { createStyles, makeStyles } from '@material-ui/core'

export interface PageHeaderProps {}

const useStyles = makeStyles(
  (theme) =>
  createStyles({
    pageHeader: {
      color: theme.palette.common.white,
      fontSize: '4rem',
      fontWeight: 'bold',
      [theme.breakpoints.down('md')] :{
        fontSize: '3rem',
      }
    },
  }),
)

export const PageHeader: React.FC<PageHeaderProps> = ({ children }) => {
  const classes = useStyles()

  return <div className={classes.pageHeader}>{children}</div>
}

PageHeader.displayName = 'PageHeader'
