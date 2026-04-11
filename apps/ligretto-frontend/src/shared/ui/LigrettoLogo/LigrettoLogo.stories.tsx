import type { Meta, StoryObj } from '@storybook/react'
import { LigrettoLogo } from './LigrettoLogo'

const meta: Meta<typeof LigrettoLogo> = {
  title: 'Ligretto / LigrettoLogo',
  component: LigrettoLogo,
}
export default meta

type Story = StoryObj<typeof LigrettoLogo>

export const DefaultView: Story = {
  render: () => <LigrettoLogo />,
}
