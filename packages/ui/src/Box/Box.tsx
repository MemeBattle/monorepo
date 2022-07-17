import type { BoxProps as MUIBoxProps } from '@mui/material/Box'
import MUIBox from '@mui/material/Box'
import { styled } from '@mui/material/styles'

export type BoxProps = MUIBoxProps & { background?: import('csstype').Property.Background; cursor?: import('csstype').Property.Cursor }

export const Box = styled(MUIBox)<BoxProps>(({ background, cursor }) => ({
  background,
  cursor,
}))
