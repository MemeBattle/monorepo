import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { autoUpdate, offset, size, useFloating, type Placement, type ReferenceType } from '@floating-ui/react-dom'

import { OnboardingArrow } from '#shared/ui/OnboardingArrow'
import type { AnchorPoint } from '#shared/ui/OnboardingArrow'
import { useTargetRelativeRect } from '#shared/lib/hooks/useTargetRelativeRect'

import { useOnboardingContainerRef } from '../targets'
import { useIsNarrowLayout } from '../useIsNarrowLayout'
import type { AnchoredStepDescription, DescriptionTargetId } from '../stepConfig'
import { BottomAnchoredDescription } from './BottomAnchoredDescription'
import { DescriptionBubble } from './DescriptionBubble'
import { useHasRoomBesidePlayground } from './useHasRoomBesidePlayground'

export type DescriptionTargets = Record<DescriptionTargetId, RefObject<HTMLElement | null>>

/** Gap between the playground edge and a bubble parked beside it. */
const PLAYGROUND_GAP = 48
/** A beside-the-playground bubble is centred this many pixels above the target's top. */
const BESIDE_TARGET_LIFT = 84
/** The playground-step bubble sits this far above the board's vertical centre. */
const PLAYGROUND_SIDE_LIFT = 148
/** Gap between the top of the board and the bubble in the band above it. */
const ABOVE_BOARD_GAP = 44
/** Minimal distance a bubble keeps from the container edges before its text rewraps. */
const EDGE_PADDING = 16
/** Design cap of the long beside-the-playground texts. */
const BESIDE_MAX_WIDTH = '28rem'

interface ArrowConfig {
  to: RefObject<HTMLElement | null>
  fromAnchor?: AnchorPoint
  toAnchor?: AnchorPoint
  twist?: number
  toGap?: number
}

interface FloatingBubbleProps {
  text: string
  /** Live lookup of the reference: refs are not attached yet on the first render. */
  getReference: () => ReferenceType | null
  placement: Placement
  mainAxisOffset: number
  crossAxisOffset?: number
  maxWidth?: string
  arrow: ArrowConfig
}

/**
 * A description bubble positioned by floating-ui against a reference element
 * (or a virtual one), with the hand-drawn arrow to the described target.
 * `size` middleware caps the bubble against the container edges, so the text
 * rewraps instead of hanging off-screen.
 */
function FloatingBubble({ text, getReference, placement, mainAxisOffset, crossAxisOffset = 0, maxWidth = '32rem', arrow }: FloatingBubbleProps) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  const { refs, floatingStyles, isPositioned } = useFloating({
    placement,
    strategy: 'absolute',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset({ mainAxis: mainAxisOffset, crossAxis: crossAxisOffset }),
      size({
        boundary: containerRef.current ?? undefined,
        padding: EDGE_PADDING,
        apply({ availableWidth, elements }) {
          elements.floating.style.maxWidth = `min(${maxWidth}, ${Math.max(availableWidth, 0)}px)`
        },
      }),
    ],
  })

  // Runs after every commit: picks the reference up once the game tree has attached its refs.
  // `setReference` bails out when the element has not changed, so this does not loop.
  useLayoutEffect(() => {
    refs.setReference(getReference())
  })

  return (
    <>
      <DescriptionBubble
        ref={node => {
          bubbleRef.current = node
          refs.setFloating(node)
        }}
        text={text}
        position={isPositioned ? { floatingStyles } : null}
      />
      {isPositioned ? (
        <OnboardingArrow
          from={bubbleRef}
          to={arrow.to}
          fromAnchor={arrow.fromAnchor}
          toAnchor={arrow.toAnchor}
          twist={arrow.twist}
          toGap={arrow.toGap}
        />
      ) : null}
    </>
  )
}

/**
 * The playground step keeps the old non-floating fallback: the bubble is centred
 * horizontally in the container (so it can never run off an edge) and lifted
 * into the band above the board.
 */
function AboveBoardBubble({ text, targetRef }: { text: string; targetRef: RefObject<HTMLElement | null> }) {
  const containerRef = useOnboardingContainerRef()
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const rect = useTargetRelativeRect(targetRef, containerRef)
  const position = rect ? { top: rect.top - ABOVE_BOARD_GAP, transform: 'translate(0, -100%)' } : null

  return (
    <>
      <DescriptionBubble ref={bubbleRef} text={text} position={position} />
      {position ? <OnboardingArrow twist={-1} fromAnchor="bottom" toAnchor="top" toGap={8} from={bubbleRef} to={targetRef} /> : null}
    </>
  )
}

interface AnchoredDescriptionProps {
  description: AnchoredStepDescription
  targets: DescriptionTargets
}

/**
 * Renders the description of an onboarding step according to its `placement`
 * from the step config. Every mode falls back to the shared bottom-anchored
 * bubble when there is no room for the wide-screen layout.
 */
export function AnchoredDescription({ description, targets }: AnchoredDescriptionProps) {
  const isNarrow = useIsNarrowLayout()
  const playgroundRef = targets.playground
  const hasRoomBeside = useHasRoomBesidePlayground(playgroundRef)

  const { text, placement, isTargetAbove } = description
  const targetRef = targets[description.target]

  const isLevelWithTarget = placement.mode === 'besidePlayground' && placement.isLevelWithTarget

  // A point at the playground's horizontal span, level with the described target:
  // the bubble is parked beside the board but vertically follows its target.
  const besideReference = useMemo<ReferenceType>(
    () => ({
      getBoundingClientRect: () => {
        const playgroundRect = (playgroundRef.current as Element).getBoundingClientRect()
        const targetRect = (targetRef.current as Element).getBoundingClientRect()
        const y = isLevelWithTarget ? targetRect.top + targetRect.height / 2 : targetRect.top - BESIDE_TARGET_LIFT
        return {
          x: playgroundRect.left,
          y,
          top: y,
          bottom: y,
          left: playgroundRect.left,
          right: playgroundRect.right,
          width: playgroundRect.width,
          height: 0,
        }
      },
      get contextElement() {
        return playgroundRef.current ?? undefined
      },
    }),
    [playgroundRef, targetRef, isLevelWithTarget],
  )

  if (placement.mode === 'besidePlayground') {
    if (!hasRoomBeside) {
      return <BottomAnchoredDescription text={text} targetRef={targetRef} isTargetAbove={isTargetAbove} />
    }
    return (
      <FloatingBubble
        text={text}
        getReference={() => (playgroundRef.current && targetRef.current ? besideReference : null)}
        placement={placement.side}
        mainAxisOffset={PLAYGROUND_GAP}
        maxWidth={BESIDE_MAX_WIDTH}
        arrow={{ to: targetRef, toAnchor: 'top', toGap: 8, twist: placement.side === 'left' ? -1 : 1 }}
      />
    )
  }

  if (placement.mode === 'playground') {
    if (hasRoomBeside) {
      return (
        <FloatingBubble
          text={text}
          getReference={() => targetRef.current}
          placement="left"
          mainAxisOffset={PLAYGROUND_GAP}
          crossAxisOffset={-PLAYGROUND_SIDE_LIFT}
          arrow={{ to: targetRef, fromAnchor: 'bottom', toAnchor: 'left' }}
        />
      )
    }
    // In a single column the free strip is under the board; on the desktop grid the board is only
    // a few pixels above the cards panel, so the hint goes into the band above it instead.
    return isNarrow ? (
      <BottomAnchoredDescription text={text} targetRef={targetRef} isTargetAbove={isTargetAbove} />
    ) : (
      <AboveBoardBubble text={text} targetRef={targetRef} />
    )
  }

  return isNarrow ? (
    <BottomAnchoredDescription text={text} targetRef={targetRef} isTargetAbove={isTargetAbove} />
  ) : (
    <FloatingBubble
      text={text}
      getReference={() => targetRef.current}
      placement="top"
      mainAxisOffset={placement.offset}
      arrow={{ to: targetRef, fromAnchor: 'bottom', toAnchor: 'top', twist: placement.twist }}
    />
  )
}
