import type { FC } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { GameGrid } from './GameGrid'

const meta: Meta<typeof GameGrid> = {
  title: 'Ligretto / GameGrid',
  component: GameGrid,
}
export default meta

type Story = StoryObj<typeof GameGrid>

const SomeComponent: FC = () => <div style={{ width: '6rem', height: '6rem', background: 'red' }}></div>
const CenterComponent: FC = () => <div style={{ width: '18rem', height: '18rem', background: 'yellow' }}>Center</div>
const BottomComponent: FC = () => <div style={{ width: '4rem', height: '8rem', background: 'salmon' }}>Bottom</div>

export const DefaultView: Story = {
  render: () => (
    <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}>
      <SomeComponent />
      <SomeComponent />
      <SomeComponent />
    </GameGrid>
  ),
}

export const EmptyChildren: Story = {
  render: () => <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}></GameGrid>,
}

export const OneChildren: Story = {
  render: () => (
    <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}>
      <SomeComponent />
    </GameGrid>
  ),
}

export const TwoChildren: Story = {
  render: () => (
    <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}>
      <SomeComponent />
      <SomeComponent />
    </GameGrid>
  ),
}

export const TreeChildren: Story = {
  render: () => (
    <GameGrid centerElement={<CenterComponent />} bottomElement={<BottomComponent />}>
      <SomeComponent />
      <SomeComponent />
      <SomeComponent />
    </GameGrid>
  ),
}

export const FourChildren: Story = {
  render: () => (
    <GameGrid centerElement={<CenterComponent />}>
      <SomeComponent />
      <SomeComponent />
      <SomeComponent />
      <SomeComponent />
    </GameGrid>
  ),
}
