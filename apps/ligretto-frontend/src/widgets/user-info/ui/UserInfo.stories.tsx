import type { Meta, StoryObj } from '@storybook/react'
import { UserInfo } from './UserInfo'

const meta: Meta<typeof UserInfo> = {
  title: 'Ligretto / UserInfo',
  component: UserInfo,
  argTypes: {
    onClick: { action: 'clicked' },
    onButtonClick: { action: 'buttonClicked' },
  },
}
export default meta

type Story = StoryObj<typeof UserInfo>

export const DefaultView: Story = {}

export const Authorized: Story = {
  argTypes: {
    onClick: { action: 'clicked' },
    username: { control: 'text' },
    onButtonClick: { action: 'button clicked' },
    img: { control: 'text' },
  },
  args: {
    username: 'themezv',
  },
}
