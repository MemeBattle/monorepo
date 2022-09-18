import React from 'react'
import { styled } from '@mui/material/styles'

export type CardPlaceSize = 'medium' | 'large'

export interface CardPlaceProps {
  size?: CardPlaceSize
}

export const heightBySize: Record<CardPlaceSize, string> = {
  medium: '120px',
  large: '180px',
}

export const widthBySize: Record<CardPlaceSize, string> = {
  medium: '84px',
  large: '130px',
}

export const borderBySize: Record<CardPlaceSize, string> = {
  medium: '12px',
  large: '3px',
}

const StyledCardPlace = styled('div')<{ size: CardPlaceSize }>(({ size }) => ({
  height: heightBySize[size],
  width: widthBySize[size],
  borderRadius: '4px',
  border: `white solid ${borderBySize[size]}`,
  position: 'relative',
}))

const StyledCard = styled('div')(() => ({
  position: 'absolute',
  top: '-12px',
  left: '-12px',
}))

export const CardPlace: React.FC<CardPlaceProps> = ({ children, size = 'medium' }) => (
  <StyledCardPlace size={size}>
    <StyledCard>{children}</StyledCard>
  </StyledCardPlace>
)

CardPlace.displayName = 'CardPlace'
