import * as React from 'react'
import { RoomGrid, RenderChildren } from './RoomGrid'
import { FC } from 'react'

export default {
  title: 'RoomGrid',
}

const Background: FC = ({ children }) => <div style={{ width: 500, height: 500, background: 'yellow' }}>{children}</div>

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
