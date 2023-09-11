import { Background } from './Background'
import type { Meta, StoryFn } from '@storybook/react'

export default {
  title: 'Ligretto / Background',
  component: Background,
} as Meta<typeof Background>

export const DefaultView: StoryFn<typeof Background> = () => <Background />
