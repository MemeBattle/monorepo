import type { Meta, StoryObj } from '@storybook/react'

import { Logo } from './Logo'

const meta: Meta<typeof Logo> = {
  parameters: { layout: 'padded' },
  title: 'CAS / Logo',
  component: Logo,
  args: { size: 112 },
}
export default meta

type Story = StoryObj<typeof Logo>

/** 112px on the sign-in hero. */
export const Hero: Story = {}

/** 96px on create account and the loading screen. */
export const Small: Story = {
  args: { size: 96 },
}

/** 44px in the dashboard header. */
export const Header: Story = {
  args: { size: 44 },
}
