import React from 'react'
import { styled } from '@mui/material/styles'

export type CardPlaceSize = 'medium' | 'large'

export interface CardPlaceProps {
  size?: CardPlaceSize
}

export const heightBySize: Record<CardPlaceSize, string> = {
  medium: '7.5rem',
  large: '11.25rem',
}

export const mobileHeightBySize: Record<CardPlaceSize, string> = {
  medium: '7.5rem',
  large: '4.6875rem',
}

export const widthBySize: Record<CardPlaceSize, string> = {
  medium: '5.25rem',
  large: '8.125rem',
}

export const mobileWidthBySize: Record<CardPlaceSize, string> = {
  medium: '5.25rem',
  large: '3.375rem',
}

export const borderBySize: Record<CardPlaceSize, string> = {
  medium: '0.75rem',
  large: '0.25rem',
}

export const mobileBorderBySize: Record<CardPlaceSize, string> = {
  medium: '0.75rem',
  large: '0.125rem',
}

const StyledCardPlace = styled('div')<{ size: CardPlaceSize }>(({ size, theme }) => ({
  height: heightBySize[size],
  width: widthBySize[size],
  borderRadius: '4px',
  border: `white solid ${borderBySize[size]}`,
  position: 'relative',
  [theme.breakpoints.down('sm')]: {
    height: mobileHeightBySize[size],
    width: mobileWidthBySize[size],
    border: `white solid ${mobileBorderBySize[size]}`,
  },
}))

const StyledCard = styled('div')<{ size: CardPlaceSize }>(({ size, theme }) => ({
  position: 'absolute',
  top: `-${borderBySize[size]}`,
  left: `-${borderBySize[size]}`,
  [theme.breakpoints.down('sm')]: {
    top: `-${mobileBorderBySize[size]}`,
    left: `-${mobileBorderBySize[size]}`,
  },
}))

export const CardPlace: React.FC<CardPlaceProps> = ({ children, size = 'medium' }) => (
  <StyledCardPlace size={size}>
    <StyledCard size={size}>{children}</StyledCard>
  </StyledCardPlace>
)

CardPlace.displayName = 'CardPlace'
