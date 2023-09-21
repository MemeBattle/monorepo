import { LigrettoLogo } from './LigrettoLogo'
import type { Meta, StoryFn } from '@storybook/react'

export default {
  title: 'Ligretto / LigrettoLogo',
  component: LigrettoLogo,
} as Meta<typeof LigrettoLogo>

export const DefaultView: StoryFn<typeof LigrettoLogo> = () => <LigrettoLogo />
