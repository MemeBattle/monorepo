import type { Meta, StoryObj } from '@storybook/react'
import { CardsRow } from './CardsRow'
import { CardColors } from '@memebattle/ligretto-shared'
import { Card } from '../Card'

const meta: Meta<typeof CardsRow> = {
  title: 'Ligretto / CardsRow',
  component: CardsRow,
}
export default meta

type Story = StoryObj<typeof CardsRow>

export const DefaultView: Story = {
  render: () => (
    <CardsRow>
      <Card color={CardColors.blue} value={1} />
      <Card color={CardColors.red} value={5} />
      <Card color={CardColors.yellow} value={10} />
    </CardsRow>
  ),
}
