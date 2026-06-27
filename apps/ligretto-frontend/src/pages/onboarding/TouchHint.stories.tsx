import type { Meta, StoryObj } from '@storybook/react'
import type { CSSProperties } from 'react'
import { TouchHint } from './TouchHint'

const wrapStyle: CSSProperties = {
  background: '#3d9970',
  width: '100%',
  height: 300,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const targetStyle: CSSProperties = {
  width: 120,
  height: 80,
  borderRadius: 8,
  border: '2px solid white',
  color: 'white',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
}

const meta: Meta<typeof TouchHint> = {
  title: 'Ligretto / TouchHint',
  component: TouchHint,
  decorators: [
    Story => (
      <div style={wrapStyle}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof TouchHint>

/** The pulsing touch icon appears 3 seconds after mount. */
export const DefaultView: Story = {
  render: () => (
    <TouchHint>
      <div style={targetStyle}>Target</div>
    </TouchHint>
  ),
}
