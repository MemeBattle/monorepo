import type { ElementType } from 'react'
import { styled } from '@mui/material'
import type { TypographyProps as MUITypographyProps, TypographyTypeMap } from '@mui/material/Typography'
import MUITypography from '@mui/material/Typography'
import type { Property } from 'csstype'

export type TypographyProps<D extends ElementType = TypographyTypeMap['defaultComponent'], P = Record<string, unknown>> = MUITypographyProps<D, P> & {
  textTransform?: Property.TextTransform
  verticalAlign?: Property.VerticalAlign
  textDecoration?: Property.TextDecoration
  userSelect?: Property.UserSelect
  wordBreak?: Property.WordBreak
  cursor?: Property.Cursor
  fontSize?: Property.FontSize | number
  fontWeight?: Property.FontWeight | number
  display?: Property.Display
  flex?: Property.Flex | number
  alignItems?: Property.AlignItems
  minHeight?: Property.MinHeight | number
  maxWidth?: Property.MaxWidth
  whiteSpace?: Property.WhiteSpace
  overflow?: Property.Overflow
  textOverflow?: Property.TextOverflow
  padding?: Property.Padding
  marginLeft?: Property.MarginLeft
  textAlign?: Property.TextAlign
}

const StyledTypography = styled(MUITypography)<TypographyProps>(
  ({
    textTransform,
    verticalAlign,
    textDecoration,
    wordBreak,
    userSelect,
    cursor,
    fontSize,
    fontWeight,
    display,
    flex,
    alignItems,
    minHeight,
    maxWidth,
    whiteSpace,
    overflow,
    textOverflow,
    padding,
    marginLeft,
    textAlign,
  }) => ({
    wordBreak,
    textTransform,
    verticalAlign,
    textDecoration,
    userSelect,
    cursor,
    fontSize,
    fontWeight,
    display,
    flex,
    alignItems,
    minHeight,
    maxWidth,
    whiteSpace,
    overflow,
    textOverflow,
    padding,
    marginLeft,
    textAlign,
  }),
)

/* This code is required in case of styled MUI components
 * with 'component' prop. This prop is not included in TabProps
 * and coming from ButtonBase https://mui.com/api/tab/. In case
 * if we don't provide this code, TS doesn't know about component prop.
 * Idea: https://mui.com/guides/composition/#with-typescript
 */
export const Typography = <C extends ElementType = 'div'>(props: TypographyProps<C, { component?: C }>) => <StyledTypography {...props} />
