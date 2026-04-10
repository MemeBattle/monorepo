import type { Meta, StoryObj } from '@storybook/react'
import { LoaderScreen } from './LoaderScreen'

const meta: Meta<typeof LoaderScreen> = {
  title: 'Ligretto / LoaderScreen',
  component: LoaderScreen,
}
export default meta

type Story = StoryObj<typeof LoaderScreen>

export const DefaultView: Story = {
  render: () => <LoaderScreen />,
}
