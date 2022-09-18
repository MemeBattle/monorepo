import { LigrettoLogo } from './LigrettoLogo'
import type { ComponentMeta, ComponentStory } from '@storybook/react'

export default {
  title: 'Ligretto / LigrettoLogo',
  component: LigrettoLogo,
} as ComponentMeta<typeof LigrettoLogo>

export const DefaultView: ComponentStory<typeof LigrettoLogo> = () => <LigrettoLogo />
