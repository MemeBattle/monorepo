import type { Meta, StoryObj } from '@storybook/react'
import { ScreenCountdown } from './ScreenCountdown'

const meta: Meta<typeof ScreenCountdown> = {
  title: 'Ligretto / ScreenCountdown',
  component: ScreenCountdown,
}
export default meta

type Story = StoryObj<typeof ScreenCountdown>

export const Default: Story = {
  args: { timeToGo: 4 },
}
