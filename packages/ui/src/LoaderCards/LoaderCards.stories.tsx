import type { Meta, StoryObj } from '@storybook/react'
import { LoaderCards } from './LoaderCards'

const meta: Meta<typeof LoaderCards> = {
  title: 'Ligretto-ui / LoaderCards',
  component: LoaderCards,
}
export default meta

type Story = StoryObj<typeof LoaderCards>

export const DefaultView: Story = {
  render: () => <LoaderCards />,
}
