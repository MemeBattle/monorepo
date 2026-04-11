import type { Meta, StoryObj } from '@storybook/react'
import { EmailSended } from './EmailSended'

const meta: Meta<typeof EmailSended> = {
  title: 'Ligretto / EmailSended',
  component: EmailSended,
}
export default meta

type Story = StoryObj<typeof EmailSended>

export const DefaultView: Story = {
  render: () => <EmailSended />,
}
