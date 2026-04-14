import type { Meta, StoryObj } from '@storybook/react'
import { Card } from './Card'
import { CardColors } from '@memebattle/ligretto-shared'
import { Stack, Box } from '@memebattle/ui'

const meta: Meta<typeof Card> = {
  title: 'Ligretto / Card',
  component: Card,
  argTypes: {
    color: {
      options: Object.values(CardColors),
      control: { type: 'select' },
    },
    size: {
      options: ['small', 'medium', 'large'],
      control: { type: 'radio' },
    },
  },
  args: {
    color: CardColors.blue,
    size: 'medium',
  },
}
export default meta

type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: args => (
    <Box sx={{ m: 2 }}>
      <Card {...args} />
    </Box>
  ),
}

export const CardsColor: Story = {
  render: () => (
    <Stack spacing={1} direction="row">
      <Card color={CardColors.blue} value={1} />
      <Card color={CardColors.red} value={2} />
      <Card color={CardColors.yellow} value={3} />
      <Card color={CardColors.green} value={10} />
      <Card color={CardColors.empty} />
      <Card color={CardColors.red} isDisabled />
      <Card color={CardColors.red} isSelected />
      <Card color={CardColors.red} isDarkened />
      <Card color={CardColors.red} />
    </Stack>
  ),
}

export const CardsSizes: Story = {
  render: () => (
    <Stack spacing={1} direction="row">
      <Card color={CardColors.blue} value={1} size="small" />
      <Card color={CardColors.blue} value={1} size="medium" />
      <Card color={CardColors.blue} value={1} size="large" />
    </Stack>
  ),
}

export const CardsValues: Story = {
  render: () => (
    <Stack spacing={2}>
      <Stack spacing={1} direction="row">
        <Card color={CardColors.yellow} size="small" />
        <Card color={CardColors.yellow} value={1} size="small" />
        <Card color={CardColors.yellow} value={10} size="small" />
      </Stack>
      <Stack spacing={1} direction="row">
        <Card color={CardColors.red} size="medium" />
        <Card color={CardColors.red} value={1} size="medium" />
        <Card color={CardColors.red} value={10} size="medium" />
      </Stack>
      <Stack spacing={1} direction="row">
        <Card color={CardColors.green} size="large" />
        <Card color={CardColors.green} value={1} size="large" />
        <Card color={CardColors.green} value={10} size="large" />
      </Stack>
    </Stack>
  ),
}
