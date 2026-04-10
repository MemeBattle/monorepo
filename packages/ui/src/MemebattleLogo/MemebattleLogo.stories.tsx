import type { Meta, StoryObj } from '@storybook/react'
import { MemebattleLogo } from './MemebattleLogo'

const meta: Meta<typeof MemebattleLogo> = {
  title: 'UI / MemebattleLogo',
  component: MemebattleLogo,
}
export default meta

type Story = StoryObj<typeof MemebattleLogo>

export const DefaultView: Story = {
  render: () => <MemebattleLogo />,
}
