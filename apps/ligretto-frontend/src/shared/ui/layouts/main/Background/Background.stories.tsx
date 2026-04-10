import type { Meta, StoryObj } from '@storybook/react'
import { Background } from './Background'

const meta: Meta<typeof Background> = {
  title: 'Ligretto / Background',
  component: Background,
}
export default meta

type Story = StoryObj<typeof Background>

export const DefaultView: Story = {
  render: () => <Background />,
}
