import * as React from 'react'
import { GameGrid } from './GameGrid'

import type { FC } from 'react'
import type { Meta } from '@storybook/react'

export default {
  title: 'Ligretto / GameGrid',
} as Meta<typeof GameGrid>

const SomeComponent: FC = () => <div style={{ width: '6rem', height: '6rem', background: 'red' }}></div>

const CenterComponent: FC = () => <div style={{ width: '18rem', height: '18rem', background: 'yellow' }}>Center</div>

const BottomComponent: FC = () => <div style={{ width: '4rem', height: '8rem', background: 'salmon' }}>Bottom</div>
export const DefaultView = () => (
  <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}>
    <SomeComponent />
    <SomeComponent />
    <SomeComponent />
  </GameGrid>
)

export const EmptyChildren = () => <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}></GameGrid>
export const OneChildren = () => (
  <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}>
    <SomeComponent />
  </GameGrid>
)

export const TwoChildren = () => (
  <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}>
    <SomeComponent />
    <SomeComponent />
  </GameGrid>
)

export const TreeChildren = () => (
  <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}>
    <SomeComponent />
    <SomeComponent />
    <SomeComponent />
  </GameGrid>
)

export const FourChildren = () => (
  <GameGrid centerElement={<CenterComponent />}>
    <SomeComponent />
    <SomeComponent />
    <SomeComponent />
    <SomeComponent />
  </GameGrid>
)
