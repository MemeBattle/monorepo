import { useRef } from 'react'
import type { CSSProperties } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { OnboardingArrow } from './OnboardingArrow'
import type { OnboardingArrowProps } from './OnboardingArrow'
import type { OnboardingArrowPathBuilder, OnboardingArrowShape } from './buildPath'
import type { AnchorPoint } from './useElementAnchorPoints'

const GAME_BG = '#3d9970'

const wrapStyle: CSSProperties = {
  background: GAME_BG,
  width: '100%',
  height: 400,
  position: 'relative',
  overflow: 'hidden',
}

const box = (top: number, left?: number, right?: number): CSSProperties => ({
  position: 'absolute',
  top,
  ...(left !== undefined ? { left } : {}),
  ...(right !== undefined ? { right } : {}),
  background: 'rgba(255,255,255,0.2)',
  border: '2px solid white',
  borderRadius: 8,
  padding: '8px 16px',
  color: 'white',
  fontSize: 13,
  whiteSpace: 'nowrap',
})

interface DemoArgs {
  shape: OnboardingArrowProps['shape']
  fromAnchor?: AnchorPoint
  toAnchor?: AnchorPoint
  curvature?: number
  twist?: number
  roughness?: number
  bowing?: number
  color?: string
  strokeWidth?: number
  seed?: number
  fromLabel?: string
  toLabel?: string
  fromStyle?: CSSProperties
  toStyle?: CSSProperties
  height?: number
}

function Demo({
  shape,
  fromAnchor = 'center',
  toAnchor = 'center',
  curvature,
  twist,
  roughness,
  bowing,
  color,
  strokeWidth,
  seed,
  fromLabel = 'From',
  toLabel = 'To',
  fromStyle = box(60, 60),
  toStyle = box(280, undefined, 60),
  height = 400,
}: DemoArgs) {
  const fromRef = useRef<HTMLDivElement>(null)
  const toRef = useRef<HTMLDivElement>(null)
  return (
    <div style={{ ...wrapStyle, height }}>
      <div ref={fromRef} style={fromStyle}>
        {fromLabel}
      </div>
      <div ref={toRef} style={toStyle}>
        {toLabel}
      </div>
      <OnboardingArrow
        from={fromRef}
        to={toRef}
        shape={shape}
        fromAnchor={fromAnchor}
        toAnchor={toAnchor}
        curvature={curvature}
        twist={twist}
        roughness={roughness}
        bowing={bowing}
        color={color}
        strokeWidth={strokeWidth}
        seed={seed}
      />
    </div>
  )
}

const meta: Meta<typeof OnboardingArrow> = {
  title: 'Ligretto / OnboardingArrow',
  component: OnboardingArrow,
}
export default meta
type Story = StoryObj<DemoArgs>

const presetOptions: OnboardingArrowShape[] = ['arc', 'sCurve', 'lasso', 'spiral', 'wave']
const anchorOptions: AnchorPoint[] = ['top', 'bottom', 'left', 'right', 'center']

export const Arc: Story = {
  render: args => <Demo {...args} fromLabel="Deck" toLabel="Playground" />,
  args: { shape: 'arc' },
}

export const SCurve: Story = {
  render: args => <Demo {...args} fromLabel="Deck" toLabel="Playground" />,
  args: { shape: 'sCurve', curvature: 0.5, twist: 1 },
}

export const Lasso: Story = {
  render: args => <Demo {...args} fromLabel="Hand" toLabel="Stack" />,
  args: { shape: 'lasso', curvature: 0.4, twist: 1 },
}

export const Spiral: Story = {
  render: args => <Demo {...args} fromLabel="Pointer" toLabel="Card" />,
  args: { shape: 'spiral', curvature: 0.6, twist: 1 },
}

export const Wave: Story = {
  render: args => <Demo {...args} fromLabel="Start" toLabel="End" />,
  args: { shape: 'wave', curvature: 0.5, twist: 2 },
}

const heartBuilder: OnboardingArrowPathBuilder = ({ from, to, chord, normal, tangent }) => {
  const r = chord * 0.4
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  const leftX = midX - tangent.x * r + normal.x * r
  const leftY = midY - tangent.y * r + normal.y * r
  const rightX = midX + tangent.x * r + normal.x * r
  const rightY = midY + tangent.y * r + normal.y * r
  return `M ${from.x} ${from.y} C ${leftX} ${leftY} ${leftX} ${leftY} ${midX + normal.x * r * 0.3} ${midY + normal.y * r * 0.3} C ${rightX} ${rightY} ${rightX} ${rightY} ${to.x} ${to.y}`
}

export const CustomBuilder: Story = {
  name: 'Custom builder (function as shape)',
  render: args => <Demo {...args} fromLabel="A" toLabel="B" />,
  args: { shape: heartBuilder },
}

export const MultipleArrows: Story = {
  render: () => {
    const deckRef = useRef<HTMLDivElement>(null)
    const playgroundRef = useRef<HTMLDivElement>(null)
    const handRef = useRef<HTMLDivElement>(null)
    return (
      <div style={{ ...wrapStyle, height: 480 }}>
        <div ref={deckRef} style={box(40, 40)}>
          Deck
        </div>
        <div ref={playgroundRef} style={box(40, undefined, 40)}>
          Playground
        </div>
        <div ref={handRef} style={box(360, 200)}>
          Hand
        </div>
        <OnboardingArrow from={deckRef} to={playgroundRef} shape="sCurve" fromAnchor="top" toAnchor="top" curvature={0.6} />
        <OnboardingArrow from={deckRef} to={handRef} shape="lasso" fromAnchor="bottom" toAnchor="top" curvature={0.5} twist={-1} />
      </div>
    )
  },
}

export const Playground: Story = {
  render: args => <Demo {...args} fromLabel="From" toLabel="To" />,
  args: {
    shape: 'arc',
    fromAnchor: 'center',
    toAnchor: 'center',
    curvature: 0.4,
    twist: 1,
    roughness: 1.8,
    bowing: 0.02,
    strokeWidth: 2.5,
    color: 'white',
  },
  argTypes: {
    shape: { control: 'select', options: presetOptions },
    fromAnchor: { control: 'select', options: anchorOptions },
    toAnchor: { control: 'select', options: anchorOptions },
    curvature: { control: { type: 'range', min: 0, max: 1.5, step: 0.05 } },
    twist: { control: { type: 'range', min: -3, max: 3, step: 0.5 } },
    roughness: { control: { type: 'range', min: 0, max: 6, step: 0.1 } },
    bowing: { control: { type: 'range', min: 0.005, max: 0.1, step: 0.005 } },
    strokeWidth: { control: { type: 'range', min: 1, max: 8, step: 0.5 } },
    color: { control: 'color' },
    seed: { control: { type: 'number' } },
  },
}
