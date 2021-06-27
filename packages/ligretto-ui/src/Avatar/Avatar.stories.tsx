import React from 'react'
import { Avatar, AvatarSize } from './Avatar'

export default {
  title: 'Avatar',
  component: Avatar,
  argTypes: {
    src: {
      control: { type: 'text' },
    },
    size: {
      options: [AvatarSize.Small, AvatarSize.Medium, AvatarSize.Large],
      control: { type: 'radio' },
    },
    alt: {
      control: { type: 'text' },
    },
  },
}

export const DefaultView = args => <Avatar {...args} />
DefaultView.args = {
  src: '',
  size: AvatarSize.Small,
  alt: 'Avatar',
}
