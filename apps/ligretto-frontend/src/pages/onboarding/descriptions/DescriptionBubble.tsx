import type { Ref } from 'react'
import { Box, Typography } from '@memebattle/ui'

/** Which way the box grows from `left`: away to the left, away to the right, or both. */
export type BubbleAlign = 'start' | 'center' | 'end'

/** `left` omitted — the bubble is centred horizontally in the container instead of anchored to a point. */
export type BubblePosition = { left?: number; top: number; transform?: string; align?: BubbleAlign }

interface DescriptionBubbleProps {
  text: string
  /** null — position is not computed yet, the bubble is hidden; 'centered' — centered on the screen */
  position: BubblePosition | 'centered' | null
  maxWidth?: string
  ref?: Ref<HTMLDivElement>
}

/**
 * How wide the box may grow before it runs past an edge of the container.
 *
 * Percentages resolve against the container, which is the bubble's containing block, so the cap
 * keeps working as the window is resized — the text wraps instead of the bubble hanging off-screen.
 */
const horizontalCap = ({ left, align = 'center' }: BubblePosition): string | null => {
  if (left === undefined) {
    return null
  }
  if (align === 'end') {
    return `${left}px`
  }
  if (align === 'start') {
    return `calc(100% - ${left}px)`
  }
  return `calc(min(${left}px, 100% - ${left}px) * 2)`
}

const positionSx = (position: DescriptionBubbleProps['position']) => {
  if (position === 'centered') {
    // `width: max-content` because a shrink-to-fit box would only get the space to the right of
    // `left: 50%` — half the screen — and wrap the text far earlier than `maxWidth` demands.
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 'max-content' }
  }
  if (!position) {
    return { left: 0, top: 0, visibility: 'hidden' as const }
  }
  if (position.left === undefined) {
    return { left: 0, right: 0, mx: 'auto', top: `${position.top}px`, transform: position.transform, visibility: 'visible' as const }
  }
  return { left: `${position.left}px`, top: `${position.top}px`, transform: position.transform, visibility: 'visible' as const }
}

export function DescriptionBubble({ text, position, maxWidth = '32rem', ref }: DescriptionBubbleProps) {
  const cap = position && position !== 'centered' ? horizontalCap(position) : null

  return (
    <Box
      ref={ref}
      sx={{
        position: 'absolute',
        maxWidth: `min(${maxWidth}, calc(100vw - 32px)${cap ? `, ${cap}` : ''})`,
        px: 2,
        py: 1,
        // Bubbles overlap the board on narrow screens — blurring what is behind keeps the text legible.
        backdropFilter: 'blur(4px)',
        borderRadius: 2,
        zIndex: 2,
        pointerEvents: 'none',
        ...positionSx(position),
      }}
    >
      {/* Narrow screens leave little room between the game board and the screen edge — a smaller
          type size keeps long texts short enough for the arrow to still have somewhere to go. */}
      <Typography sx={{ fontSize: { xs: '1rem', md: '1.2rem' } }} textAlign="center" variant="body1" fontWeight="bold" whiteSpace="pre-line">
        {text}
      </Typography>
    </Box>
  )
}
