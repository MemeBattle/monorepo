import * as React from 'react'
import type { PositionOnTable } from './RoomGrid'
import { RoomGrid } from './RoomGrid'

import type { FC } from 'react'

export default {
  title: 'Ligretto-ui / RoomGrid',
}

const SomeComponent: FC<{ position?: PositionOnTable }> = ({ position }) => <span>position: {position}</span>

export const DefaultView = () => (
  <RoomGrid>
    <SomeComponent />
    <SomeComponent />
    <SomeComponent />
  </RoomGrid>
)

export const OneChildren = () => (
  <RoomGrid>
    <SomeComponent />
  </RoomGrid>
)

export const TwoChildren = () => (
  <RoomGrid>
    <SomeComponent />
    <SomeComponent />
  </RoomGrid>
)

export const TreeChildren = () => (
  <RoomGrid>
    <SomeComponent />
    <SomeComponent />
    <SomeComponent />
  </RoomGrid>
)

export const FourChildren = () => (
  <RoomGrid>
    <SomeComponent />
    <SomeComponent />
    <SomeComponent />
    <SomeComponent />
  </RoomGrid>
)
