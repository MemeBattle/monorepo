import { Avatar } from './Avatar'
import { userAvatars } from './getRandomAvatar'
import type { ComponentMeta, ComponentStory } from '@storybook/react'

export default {
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
} as ComponentMeta<typeof Avatar>

export const DefaultView: ComponentStory<typeof Avatar> = args => <Avatar {...args} />

export const AvatarSize = DefaultView.bind({})
AvatarSize.argTypes = {
  src: {
    control: { type: 'label' },
    defaultValue: userAvatars[0],
  },
  size: {
    options: ['small', 'medium', 'large', 'auto'],
    control: { type: 'radio' },
  },
}

export const AvatarUrl = DefaultView.bind({})
AvatarUrl.argTypes = {
  src: {
    control: { type: 'text' },
    defaultValue: userAvatars[0],
  },
  alt: {
    control: { type: 'text' },
    defaultValue: 'Avatar',
  },
}
