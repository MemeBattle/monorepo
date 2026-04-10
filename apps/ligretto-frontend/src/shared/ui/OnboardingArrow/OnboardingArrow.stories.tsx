import { useRef } from 'react'
import type { CSSProperties } from 'react'
import { OnboardingArrow } from './OnboardingArrow'
import type { OnboardingArrowProps } from './OnboardingArrow'
import type { AnchorPoint } from './useElementAnchorPoints'

const GAME_BG = '#3d9970'

const wrapStyle: CSSProperties = {
  background: GAME_BG,
  width: '100%',
  height: '400px',
  position: 'relative',
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
  whiteSpace: 'nowrap' as const,
})

interface DemoProps {
  variant: OnboardingArrowProps['variant']
  fromAnchor?: AnchorPoint
  toAnchor?: AnchorPoint
  color?: string
  fromLabel?: string
  toLabel?: string
  fromStyle?: CSSProperties
  toStyle?: CSSProperties
}

function Demo({
  variant,
  fromAnchor = 'center',
  toAnchor = 'center',
  color = 'white',
  fromLabel = 'From',
  toLabel = 'To',
  fromStyle = box(50, 50),
  toStyle = box(250, undefined, 50),
}: DemoProps) {
  const fromRef = useRef<HTMLDivElement>(null)
  const toRef = useRef<HTMLDivElement>(null)
  return (
    <div style={wrapStyle}>
      <div ref={fromRef} style={fromStyle}>
        {fromLabel}
      </div>
      <div ref={toRef} style={toStyle}>
        {toLabel}
      </div>
      <OnboardingArrow from={fromRef} to={toRef} variant={variant} fromAnchor={fromAnchor} toAnchor={toAnchor} color={color} />
    </div>
  )
}

export default {
  title: 'Ligretto / OnboardingArrow',
  component: OnboardingArrow,
}

// ── Arc ───────────────────────────────────────────────────────────────────────

export const ArcDefault = () => <Demo variant="arc" fromLabel="Deck" toLabel="Playground" />
ArcDefault.storyName = 'Arc — center → center'

export const ArcEdgeAnchors = () => (
  <Demo
    variant="arc"
    fromAnchor="right"
    toAnchor="left"
    fromLabel="Deck"
    toLabel="Playground"
    fromStyle={box(160, 30)}
    toStyle={box(160, undefined, 30)}
  />
)
ArcEdgeAnchors.storyName = 'Arc — right → left edges'

export const ArcTopAnchors = () => (
  <Demo
    variant="arc"
    fromAnchor="top"
    toAnchor="top"
    fromLabel="Deck"
    toLabel="Playground"
    fromStyle={box(160, 30)}
    toStyle={box(160, undefined, 30)}
  />
)
ArcTopAnchors.storyName = 'Arc — top → top (rainbow over elements)'

export const ArcCustomColor = () => <Demo variant="arc" color="#FFD700" fromLabel="Deck" toLabel="Playground" />
ArcCustomColor.storyName = 'Arc — custom color'

// ── Loop ──────────────────────────────────────────────────────────────────────

export const LoopDefault = () => <Demo variant="loop" fromLabel="Hand" toLabel="Stack" />
LoopDefault.storyName = 'Loop — center → center'

export const LoopBottomToTop = () => (
  <Demo variant="loop" fromAnchor="bottom" toAnchor="top" fromLabel="Hand" toLabel="Stack" fromStyle={box(240, 160)} toStyle={box(60, 160)} />
)
LoopBottomToTop.storyName = 'Loop — bottom → top (vertical)'

export const LoopCustomColor = () => <Demo variant="loop" color="#FFD700" fromLabel="Hand" toLabel="Stack" />
LoopCustomColor.storyName = 'Loop — custom color'

// ── Multiple arrows ───────────────────────────────────────────────────────────

export const MultipleArrows = () => {
  const deckRef = useRef<HTMLDivElement>(null)
  const playgroundRef = useRef<HTMLDivElement>(null)
  const handRef = useRef<HTMLDivElement>(null)
  return (
    <div style={{ ...wrapStyle, height: '480px' }}>
      <div ref={deckRef} style={box(40, 40)}>
        Deck
      </div>
      <div ref={playgroundRef} style={box(40, undefined, 40)}>
        Playground
      </div>
      <div ref={handRef} style={box(340, 180)}>
        Hand
      </div>
      <OnboardingArrow from={deckRef} to={playgroundRef} variant="arc" fromAnchor="top" toAnchor="top" />
      <OnboardingArrow from={deckRef} to={handRef} variant="loop" fromAnchor="bottom" toAnchor="top" />
    </div>
  )
}
MultipleArrows.storyName = 'Multiple arrows — arc + loop together'

// ── Playground (interactive controls) ────────────────────────────────────────

export const Playground = (args: Pick<OnboardingArrowProps, 'variant' | 'color'> & { fromAnchor: AnchorPoint; toAnchor: AnchorPoint }) => {
  const fromRef = useRef<HTMLDivElement>(null)
  const toRef = useRef<HTMLDivElement>(null)
  return (
    <div style={wrapStyle}>
      <div ref={fromRef} style={box(50, 50)}>
        From
      </div>
      <div ref={toRef} style={box(280, undefined, 50)}>
        To
      </div>
      <OnboardingArrow from={fromRef} to={toRef} variant={args.variant} fromAnchor={args.fromAnchor} toAnchor={args.toAnchor} color={args.color} />
    </div>
  )
}
Playground.storyName = 'Playground (controls)'
Playground.args = {
  variant: 'arc',
  fromAnchor: 'center',
  toAnchor: 'center',
  color: 'white',
}
Playground.argTypes = {
  variant: { control: 'select', options: ['arc', 'loop'] },
  fromAnchor: { control: 'select', options: ['top', 'bottom', 'left', 'right', 'center'] },
  toAnchor: { control: 'select', options: ['top', 'bottom', 'left', 'right', 'center'] },
  color: { control: 'color' },
}
