import * as React from 'react'
import type { RenderChildren } from './RoomGrid'
import { RoomGrid } from './RoomGrid'

import { Background } from '../story-components'

export default {
  title: 'RoomGrid',
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
