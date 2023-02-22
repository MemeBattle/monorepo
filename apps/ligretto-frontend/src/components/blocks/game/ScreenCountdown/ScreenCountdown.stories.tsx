import type { ComponentMeta, ComponentStory } from '@storybook/react'
import { ScreenCountdown } from './ScreenCountdown'

export default {
  title: 'Ligretto / ScreenCountdown',
  component: ScreenCountdown,
  argTypes: {},
} as ComponentMeta<typeof ScreenCountdown>

export const Default: ComponentStory<typeof ScreenCountdown> = args => <ScreenCountdown {...args} timeToGo={3} />
