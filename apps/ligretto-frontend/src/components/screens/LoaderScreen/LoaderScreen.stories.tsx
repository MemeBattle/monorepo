import { LoaderScreen } from './LoaderScreen'
import type { ComponentMeta, ComponentStory } from '@storybook/react'

export default {
  title: 'Ligretto / LoaderScreen',
  component: LoaderScreen,
} as ComponentMeta<typeof LoaderScreen>

export const DefaultView: ComponentStory<typeof LoaderScreen> = () => <LoaderScreen />
