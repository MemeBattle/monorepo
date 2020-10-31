import * as React from 'react'
import { RoomGrid, RenderChildren } from './RoomGrid'
import { FC } from 'react'
import { createStyles, makeStyles } from '@material-ui/core'

export default {
  title: 'RoomGrid',
}

const useStyles = makeStyles(theme =>
  createStyles({
    background: { height: 500, background: theme.palette.primary.main, position: 'relative' },
  }),
)

const Background: FC = ({ children }) => {
  const classes = useStyles()

  return <div className={classes.background}>{children}</div>
}

const renderChildren: RenderChildren = position => <span>{position}</span>

export const DefaultView = () => (
  <Background>
    <RoomGrid renderChildren={[renderChildren, renderChildren, renderChildren]} />
  </Background>
)

export const OneChildren = () => (
  <Background>
    <RoomGrid renderChildren={[renderChildren]} />
  </Background>
)

export const TwoChildren = () => (
  <Background>
    <RoomGrid renderChildren={[renderChildren, renderChildren]} />
  </Background>
)
