import type { Meta, StoryObj } from '@storybook/react'
import { UserInfo } from './UserInfo'

const meta: Meta<typeof UserInfo> = {
  title: 'Ligretto / UserInfo',
  component: UserInfo,
  argTypes: {
    onClick: { action: 'clicked' },
    onButtonClick: { action: 'buttonClicked' },
    onLogoutClick: { action: 'logoutClicked' },
  },
}
export default meta

type Story = StoryObj<typeof UserInfo>

export const Guest: Story = {
  args: {
    isGuest: true,
  },
}

export const FullAccount: Story = {
  argTypes: {
    displayName: { control: 'text' },
    img: { control: 'text' },
  },
  args: {
    isGuest: false,
    displayName: 'themezv',
  },
}
