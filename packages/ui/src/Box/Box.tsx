import type { ComponentType } from 'react'
import type { BoxProps as MUIBoxProps } from '@mui/material/Box'
import MUIBox from '@mui/material/Box'
import { styled } from '@mui/material/styles'

export type BoxProps = MUIBoxProps & {
  background?: import('csstype').Property.Background
  cursor?: import('csstype').Property.Cursor
  pointerEvents?: import('csstype').Property.PointerEvents
  transform?: import('csstype').Property.Transform
}

export const Box: ComponentType<BoxProps> = styled(MUIBox)<BoxProps>(({ background, cursor, pointerEvents, transform }) => ({
  background,
  cursor,
  pointerEvents,
  transform,
}))
