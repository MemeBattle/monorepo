import type { Meta, StoryObj } from '@storybook/react'
import { Avatar } from './Avatar'
import { userAvatars } from './getRandomAvatar'

const meta: Meta<typeof Avatar> = {
  title: 'Ligretto / Avatar',
  component: Avatar,
  argTypes: {
    src: {
      control: { type: 'radio' },
      options: [userAvatars[0], userAvatars[1], userAvatars[2], userAvatars[3], userAvatars[4], userAvatars[5], userAvatars[6], userAvatars[7]],
    },
    size: {
      options: ['small', 'medium', 'large', 'auto'],
      control: { type: 'radio' },
    },
  },
}
export default meta

type Story = StoryObj<typeof Avatar>

export const DefaultView: Story = {}

export const AvatarSize: Story = {
  argTypes: {
    src: {
      control: { type: 'label' },
    },
    size: {
      options: ['small', 'medium', 'large', 'auto'],
      control: { type: 'radio' },
    },
  },
  args: {
    src: userAvatars[0],
  },
}

export const AvatarUrl: Story = {
  argTypes: {
    src: {
      control: { type: 'text' },
    },
    alt: {
      control: { type: 'text' },
    },
  },
  args: {
    src: userAvatars[0],
    alt: 'Avatar',
  },
}
