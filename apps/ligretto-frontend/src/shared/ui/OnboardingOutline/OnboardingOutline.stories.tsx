import type { Meta, StoryObj } from '@storybook/react'
import type { CSSProperties } from 'react'
import { OnboardingOutline } from './OnboardingOutline'

const wrapStyle: CSSProperties = {
  background: '#3d9970',
  padding: 24,
  display: 'inline-flex',
}

const meta: Meta<typeof OnboardingOutline> = {
  title: 'Ligretto / OnboardingOutline',
  component: OnboardingOutline,
  decorators: [
    Story => (
      <div style={wrapStyle}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof OnboardingOutline>

export const DefaultView: Story = {
  render: () => <OnboardingOutline />,
}
