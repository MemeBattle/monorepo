import * as React from 'react'
import type { PositionOnTable } from './RoomGrid'
import { RoomGrid } from './RoomGrid'

import { Background } from '../story-components'
import type { FC } from 'react'

export default {
  title: 'RoomGrid',
}

const SomeComponent: FC<{ position?: PositionOnTable }> = ({ position }) => <span>position: {position}</span>

export const DefaultView = () => (
  <Background>
    <RoomGrid>
      <SomeComponent />
      <SomeComponent />
      <SomeComponent />
    </RoomGrid>
  </Background>
)

export const OneChildren = () => (
  <Background>
    <RoomGrid>
      <SomeComponent />
    </RoomGrid>
  </Background>
)

export const TwoChildren = () => (
  <Background>
    <RoomGrid>
      <SomeComponent />
      <SomeComponent />
    </RoomGrid>
  </Background>
)

export const TreeChildren = () => (
  <Background>
    <RoomGrid>
      <SomeComponent />
      <SomeComponent />
      <SomeComponent />
    </RoomGrid>
  </Background>
)

export const FourChildren = () => (
  <Background>
    <RoomGrid>
      <SomeComponent />
      <SomeComponent />
      <SomeComponent />
      <SomeComponent />
    </RoomGrid>
  </Background>
)
