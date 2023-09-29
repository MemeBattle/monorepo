import type { Meta, StoryObj } from '@storybook/react'
import { Tabs } from './Tabs'
import { Tab } from '@memebattle/ui'

const meta: Meta<typeof Tabs> = {
  component: Tabs,
}

export default meta
type Story = StoryObj<typeof Tabs>

export const Default: Story = {
  args: {
    children: ['For day', 'For month', 'For all the time'].map(title => <Tab label={title} />),
    value: 0,
    variant: 'fullWidth',
  },
}
