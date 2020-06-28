---
to: packages/ligretto-ui/src/<%= h.changeCase.pascal(name) %>/<%= h.changeCase.pascal(name) %>.tsx
---
import React from 'react'
import { createStyles, makeStyles } from '@material-ui/core'

export interface <%= h.changeCase.pascal(name) %>Props {}

const useStyles = makeStyles(
  createStyles({
    <%= h.changeCase.camelCase(name) %>: {},
  }),
)

export const <%= h.changeCase.pascal(name) %>: React.FC<<%= h.changeCase.pascal(name) %>Props> = ({ children }) => {
  const classes = useStyles()

  return <div className={classes.<%= h.changeCase.camelCase(name) %>}>{children}</div>
}

<%= h.changeCase.pascal(name) %>.displayName = '<%= h.changeCase.pascal(name) %>'
