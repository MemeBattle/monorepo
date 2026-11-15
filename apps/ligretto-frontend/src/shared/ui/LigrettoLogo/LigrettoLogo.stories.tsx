import type { Meta, StoryObj } from '@storybook/react'
import { Box } from '@memebattle/ui'
import { LigrettoLogo } from './LigrettoLogo'

const meta: Meta<typeof LigrettoLogo> = {
  title: 'Ligretto / LigrettoLogo',
  component: LigrettoLogo,
}
export default meta

type Story = StoryObj<typeof LigrettoLogo>

export const DefaultView: Story = {
  render: () => (
    <Box height="13rem">
      <LigrettoLogo />
    </Box>
  ),
}
