import type { Ref } from 'react'
import { Box, Typography } from '@memebattle/ui'

export type BubblePosition = { left: number; top: number; transform?: string }

interface DescriptionBubbleProps {
  text: string
  /** null — position is not computed yet, the bubble is hidden; 'centered' — centered on the screen */
  position: BubblePosition | 'centered' | null
  maxWidth?: string
  ref?: Ref<HTMLDivElement>
}

const positionSx = (position: DescriptionBubbleProps['position']) => {
  if (position === 'centered') {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }
  if (!position) {
    return { left: 0, top: 0, visibility: 'hidden' as const }
  }
  return { left: `${position.left}px`, top: `${position.top}px`, transform: position.transform, visibility: 'visible' as const }
}

export function DescriptionBubble({ text, position, maxWidth = '32rem', ref }: DescriptionBubbleProps) {
  return (
    <Box
      ref={ref}
      sx={{
        position: 'absolute',
        maxWidth: `min(${maxWidth}, calc(100vw - 32px))`,
        px: 2,
        zIndex: 2,
        pointerEvents: 'none',
        ...positionSx(position),
      }}
    >
      <Typography fontSize="1.2rem" textAlign="center" variant="body1" fontWeight="bold" whiteSpace="pre-line">
        {text}
      </Typography>
    </Box>
  )
}
