import React from 'react'
import { Avatar } from './Avatar'
import { userAvatars } from './getRandomAvatar'

export default {
  title: 'Avatar',
  component: Avatar,
  argTypes: {
    src: {
      control: { type: 'text' },
    },
    size: {
      options: ['small', 'medium', 'large', 'auto'],
      control: { type: 'radio' },
    },
    alt: {
      control: { type: 'text' },
    },
  },
}

export const DefaultView = args => <Avatar {...args} />

export const Avatar1 = DefaultView.bind({})
Avatar1.args = {
  src: userAvatars[1],
  size: 'small',
  alt: 'Avatar',
}

export const Avatar2 = DefaultView.bind({})
Avatar2.args = {
  src: userAvatars[2],
  size: 'small',
  alt: 'Avatar',
}

export const Avatar3 = DefaultView.bind({})
Avatar3.args = {
  src: userAvatars[3],
  size: 'small',
  alt: 'Avatar',
}

export const Avatar4 = DefaultView.bind({})
Avatar4.args = {
  src: userAvatars[4],
  size: 'small',
  alt: 'Avatar',
}

export const Avatar5 = DefaultView.bind({})
Avatar5.args = {
  src: userAvatars[5],
  size: 'small',
  alt: 'Avatar',
}

export const Avatar6 = DefaultView.bind({})
Avatar6.args = {
  src: userAvatars[6],
  size: 'small',
  alt: 'Avatar',
}

export const Avatar7 = DefaultView.bind({})
Avatar7.args = {
  src: userAvatars[7],
  size: 'small',
  alt: 'Avatar',
}

export const Avatar8 = DefaultView.bind({})
Avatar8.args = {
  src: userAvatars[8],
  size: 'small',
  alt: 'Avatar',
}
