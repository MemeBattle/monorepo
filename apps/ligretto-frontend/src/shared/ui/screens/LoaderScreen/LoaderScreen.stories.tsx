import { LoaderScreen } from './LoaderScreen'
import type { Meta, StoryFn } from '@storybook/react'

export default {
  title: 'Ligretto / LoaderScreen',
  component: LoaderScreen,
} as Meta<typeof LoaderScreen>

export const DefaultView: StoryFn<typeof LoaderScreen> = () => <LoaderScreen />
