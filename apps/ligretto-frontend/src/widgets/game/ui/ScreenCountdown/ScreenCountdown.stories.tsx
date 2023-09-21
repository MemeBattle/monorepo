import type { Meta, StoryFn } from '@storybook/react'
import { ScreenCountdown } from './ScreenCountdown'

export default {
  title: 'Ligretto / ScreenCountdown',
  component: ScreenCountdown,
  argTypes: {},
} as Meta<typeof ScreenCountdown>

export const Default: StoryFn<typeof ScreenCountdown> = args => <ScreenCountdown {...args} timeToGo={4} />
