import type { ComponentType } from 'react'
import type { BoxProps as MUIBoxProps } from '@mui/material/Box'
import MUIBox from '@mui/material/Box'
import { styled } from '@mui/material/styles'
import type { Property } from 'csstype'

export type BoxProps = MUIBoxProps & {
  background?: Property.Background
  cursor?: Property.Cursor
  pointerEvents?: Property.PointerEvents
  transform?: Property.Transform
  display?: Property.Display
  position?: Property.Position
  flex?: Property.Flex | number
  flexDirection?: Property.FlexDirection
  justifyContent?: Property.JustifyContent
  justifySelf?: Property.JustifySelf
  alignItems?: Property.AlignItems
  alignSelf?: Property.AlignSelf
  flexWrap?: Property.FlexWrap
  gridArea?: Property.GridArea
  width?: Property.Width | number
  height?: Property.Height | number
  minHeight?: Property.MinHeight | number
  maxHeight?: Property.MaxHeight | number
  minWidth?: Property.MinWidth | number
  maxWidth?: Property.MaxWidth | number
  padding?: Property.Padding | number
  margin?: Property.Margin | number
  marginTop?: Property.MarginTop
  marginBottom?: Property.MarginBottom
  marginLeft?: Property.MarginLeft
  marginRight?: Property.MarginRight
  overflow?: Property.Overflow
  overflowX?: Property.OverflowX
  overflowY?: Property.OverflowY
  textAlign?: Property.TextAlign
  gap?: Property.Gap | number
  borderRadius?: Property.BorderRadius | number
  fontSize?: Property.FontSize | number
  fontWeight?: Property.FontWeight | number
  whiteSpace?: Property.WhiteSpace
  textOverflow?: Property.TextOverflow
  border?: Property.Border
  borderColor?: Property.BorderColor
  opacity?: Property.Opacity | number
  bgcolor?: Property.BackgroundColor
}

const BOX_CUSTOM_PROPS = new Set([
  'background',
  'cursor',
  'pointerEvents',
  'transform',
  'display',
  'position',
  'flex',
  'flexDirection',
  'justifyContent',
  'justifySelf',
  'alignItems',
  'alignSelf',
  'flexWrap',
  'gridArea',
  'width',
  'height',
  'minHeight',
  'maxHeight',
  'minWidth',
  'maxWidth',
  'padding',
  'margin',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'overflow',
  'overflowX',
  'overflowY',
  'textAlign',
  'gap',
  'borderRadius',
  'fontSize',
  'fontWeight',
  'whiteSpace',
  'textOverflow',
  'border',
  'borderColor',
  'opacity',
  'bgcolor',
])

export const Box: ComponentType<BoxProps> = styled(MUIBox, {
  shouldForwardProp: prop => !BOX_CUSTOM_PROPS.has(prop),
})<BoxProps>(
  ({
    background,
    cursor,
    pointerEvents,
    transform,
    display,
    position,
    flex,
    flexDirection,
    justifyContent,
    justifySelf,
    alignItems,
    alignSelf,
    flexWrap,
    gridArea,
    width,
    height,
    minHeight,
    maxHeight,
    minWidth,
    maxWidth,
    padding,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    overflow,
    overflowX,
    overflowY,
    textAlign,
    gap,
    borderRadius,
    fontSize,
    fontWeight,
    whiteSpace,
    textOverflow,
    border,
    borderColor,
    opacity,
    bgcolor,
  }) => ({
    background,
    cursor,
    pointerEvents,
    transform,
    display,
    position,
    flex,
    flexDirection,
    justifyContent,
    justifySelf,
    alignItems,
    alignSelf,
    flexWrap,
    gridArea,
    width,
    height,
    minHeight,
    maxHeight,
    minWidth,
    maxWidth,
    padding,
    margin,
    marginTop,
    marginBottom,
    marginLeft,
    marginRight,
    overflow,
    overflowX,
    overflowY,
    textAlign,
    gap,
    borderRadius,
    fontSize,
    fontWeight,
    whiteSpace,
    textOverflow,
    border,
    borderColor,
    opacity,
    backgroundColor: bgcolor,
  }),
)
