import type { ElementType } from 'react'
import { styled } from '@mui/material'
import type { TypographyProps as MUITypographyProps, TypographyTypeMap } from '@mui/material/Typography'
import MUITypography from '@mui/material/Typography'

export type TypographyProps<D extends ElementType = TypographyTypeMap['defaultComponent'], P = Record<string, unknown>> = MUITypographyProps<D, P> & {
  textTransform?: import('csstype').Property.TextTransform
  verticalAlign?: import('csstype').Property.VerticalAlign
  textDecoration?: import('csstype').Property.TextDecoration
  userSelect?: import('csstype').Property.UserSelect
  wordBreak?: import('csstype').Property.WordBreak
  cursor?: import('csstype').Property.Cursor
}

const StyledTypography = styled(MUITypography)<TypographyProps>(
  ({ textTransform, verticalAlign, textDecoration, wordBreak, userSelect, cursor }) => ({
    wordBreak,
    textTransform,
    verticalAlign,
    textDecoration,
    userSelect,
    cursor,
  }),
)

/* This code is required in case of styled MUI components
 * with 'component' prop. This prop is not included in TabProps
 * and coming from ButtonBase https://mui.com/api/tab/. In case
 * if we don't provide this code, TS doesn't know about component prop.
 * Idea: https://mui.com/guides/composition/#with-typescript
 */
export const Typography = <C extends ElementType = 'div'>(props: TypographyProps<C, { component?: C }>) => <StyledTypography {...props} />
