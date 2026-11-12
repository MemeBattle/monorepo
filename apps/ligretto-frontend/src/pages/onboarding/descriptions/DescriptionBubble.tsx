import type { CSSProperties, Ref } from 'react'
import { Box, Typography } from '@memebattle/ui'

/** `top`-only position: the bubble is centred horizontally in the container. */
type BubblePosition = { top: number; transform?: string }

interface DescriptionBubbleProps {
  text: string
  /**
   * null — position is not computed yet, the bubble is hidden;
   * 'centered' — centered on the screen;
   * `{ floatingStyles }` — positioned by floating-ui (see `AnchoredDescription`);
   * `BubblePosition` — centred horizontally, anchored vertically.
   */
  position: BubblePosition | 'centered' | { floatingStyles: CSSProperties } | null
  maxWidth?: string
  ref?: Ref<HTMLDivElement>
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
  if ('floatingStyles' in position) {
    return { ...(position.floatingStyles as Record<string, unknown>), visibility: 'visible' as const }
  }
  return { left: 0, right: 0, mx: 'auto', top: `${position.top}px`, transform: position.transform, visibility: 'visible' as const }
}

export function DescriptionBubble({ text, position, maxWidth = '32rem', ref }: DescriptionBubbleProps) {
  return (
    <Box
      ref={ref}
      sx={{
        position: 'absolute',
        width: 'max-content',
        maxWidth: `min(${maxWidth}, calc(100vw - 32px))`,
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
