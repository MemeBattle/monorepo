import type { Meta, StoryObj } from '@storybook/react'
import type { CSSProperties } from 'react'
import { NextButton } from './NextButton'

const wrapStyle: CSSProperties = {
  background: '#3d9970',
  padding: 24,
  display: 'inline-flex',
}

const meta: Meta<typeof NextButton> = {
  title: 'Ligretto / NextButton',
  component: NextButton,
  decorators: [
    Story => (
      <div style={wrapStyle}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof NextButton>

export const DefaultView: Story = {
  render: () => <NextButton />,
}
