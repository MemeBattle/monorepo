import React from 'react'
import { styled } from '@mui/material/styles'

const Backdrop = styled('div')(() => ({ width: '100%', height: '100%', position: 'relative' }))

const Figure = styled('div')<{
  top?: import('csstype').Property.Top
  right?: import('csstype').Property.Right
  left?: import('csstype').Property.Left
  bottom?: import('csstype').Property.Bottom
}>(({ top, right, left, bottom, theme }) => ({
  position: 'absolute',
  background: theme.palette.background.lighter,
  color: theme.palette.background.lighter,
  zIndex: '-1',
  opacity: 0.2,
  top,
  right,
  left,
  bottom,
}))

const Circle = styled(Figure)<{ size: string }>(({ size }) => ({
  borderRadius: '100%',
  height: size,
  width: size,
}))

const Rect = styled(Figure)<{
  width: import('csstype').Property.Width
  height: import('csstype').Property.Height
  rotate: number
}>(({ width, height, rotate }) => ({
  width,
  height,
  transform: `rotate(${rotate}deg)`,
}))

const Triangle = styled(Figure)<{
  size: number
  rotate?: number
}>(({ size, rotate }) => ({
  borderLeft: `${size}vmin solid transparent`,
  borderRight: `${size}vmin solid transparent`,
  borderBottom: `${size * 2}vmin solid`,
  background: 'transparent',
  transform: rotate ? `rotate(${rotate}deg)` : undefined,
}))

export const Background: React.FC = ({ children }) => (
  <Backdrop>
    {children}
    <Circle size="34vmin" top="45%" />
    <Circle size="7vmin" right="24vmin" top="51%" />
    <Circle size="7rem" right="1rem" top="27%" />
    <Rect width="2rem" height="2rem" top="2rem" left="4rem" rotate={40} />
    <Rect width="3rem" height="3rem" bottom="2rem" right="4rem" rotate={40} />
    <Rect width="3rem" height="1.5rem" bottom="4rem" left="1rem" rotate={13} />
    <Rect width="1rem" height="3rem" bottom="1rem" left="50vw" rotate={156} />
    <Rect width="3rem" height="3rem" top="2rem" left="50%" rotate={30} />
    <Rect width="10%" height="10%" bottom="40%" right="50%" rotate={40} />
    <Triangle size={7} rotate={40} right="2rem" top="2rem" />
    <Triangle size={5} rotate={40} left="30%" top="6rem" />
    <Triangle size={6} right="7%" top="65%" />
  </Backdrop>
)

Background.displayName = 'Background'
