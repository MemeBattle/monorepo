import type { Meta, StoryObj } from '@storybook/react'
import { CardPlace } from './CardPlace'
import { Stack } from '@memebattle/ui'

const meta: Meta<typeof CardPlace> = {
  title: 'Ligretto / CardPlace',
  component: CardPlace,
}
export default meta

type Story = StoryObj<typeof CardPlace>

export const DefaultView: Story = {
  render: () => (
    <Stack spacing={2} direction="row">
      <CardPlace size="small" />
      <CardPlace size="medium" />
      <CardPlace size="large" />
    </Stack>
  ),
}
