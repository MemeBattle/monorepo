import type { Meta, StoryObj } from '@storybook/react'
import { Typography } from './Typography'

const meta: Meta<typeof Typography> = {
  title: 'UI / Typography',
  component: Typography,
}
export default meta

type Story = StoryObj<typeof Typography>

export const DefaultView: Story = {
  render: () => <Typography>Typhography</Typography>,
}

export const WithVariant: Story = {
  render: () => <Typography textTransform="uppercase">uppercased text</Typography>,
}
