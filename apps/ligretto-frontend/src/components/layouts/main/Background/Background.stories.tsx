import { Background } from './Background'
import type { ComponentMeta } from '@storybook/react'
import type { ComponentStory } from '@storybook/react'

export default {
  title: 'Ligretto / Background',
  component: Background,
} as ComponentMeta<typeof Background>

export const DefaultView: ComponentStory<typeof Background> = () => <Background />
