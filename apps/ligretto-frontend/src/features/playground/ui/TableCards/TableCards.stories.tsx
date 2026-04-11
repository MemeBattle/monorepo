import type { Meta, StoryObj } from '@storybook/react'
import { TableCards } from './TableCards'
import { CardPlace } from '#entities/card'

const meta: Meta<typeof TableCards> = {
  title: 'Ligretto / TableCards',
  component: TableCards,
}
export default meta

type Story = StoryObj<typeof TableCards>

export const DefaultView: Story = {
  render: () => (
    <TableCards>
      {Array(12)
        .fill(1)
        .map((_, index) => (
          <CardPlace key={index} />
        ))}
    </TableCards>
  ),
}
