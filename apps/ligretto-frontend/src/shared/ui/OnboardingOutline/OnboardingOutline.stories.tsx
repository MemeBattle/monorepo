import type { Meta, StoryObj } from '@storybook/react'
import type { CSSProperties } from 'react'
import { OnboardingOutline } from './OnboardingOutline'

const wrapStyle: CSSProperties = {
  background: '#3d9970',
  padding: 48,
  display: 'inline-flex',
}

const outlineStyle = (width: number, height: number): CSSProperties => ({
  position: 'relative',
  width,
  height,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
})

const cardStyle: CSSProperties = {
  width: 80,
  height: 112,
  borderRadius: 8,
  background: 'rgba(255,255,255,0.25)',
  border: '2px solid white',
}

/** The outline fills its parent, so the parent sizes the loop around the wrapped content. */
const Demo = ({ width, height, cards }: { width: number; height: number; cards: number }) => (
  <div style={wrapStyle}>
    <div style={outlineStyle(width, height)}>
      {Array.from({ length: cards }, (_, index) => (
        <div key={index} style={cardStyle} />
      ))}
      <div style={{ position: 'absolute', inset: 0 }}>
        <OnboardingOutline />
      </div>
    </div>
  </div>
)

const meta: Meta<typeof OnboardingOutline> = {
  title: 'Ligretto / OnboardingOutline',
  component: OnboardingOutline,
}
export default meta

type Story = StoryObj<typeof OnboardingOutline>

export const DefaultView: Story = {
  render: () => <Demo width={273} height={243} cards={1} />,
}

export const AroundSingleCard: Story = {
  render: () => <Demo width={128} height={160} cards={1} />,
}

export const AroundCardsRow: Story = {
  render: () => <Demo width={340} height={168} cards={3} />,
}
