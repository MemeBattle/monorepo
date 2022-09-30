import React from 'react'
import { styled } from '@mui/material/styles'

import { widthByCardSize, heightByCardSize, mobileHeightBySize, mobileWidthBySize, tabletWidthBySize, tabletHeightBySize } from '../Card'

export type CardPlaceSize = 'small' | 'medium' | 'large'

export interface CardPlaceProps {
  size?: CardPlaceSize
}

export const borderBySize: Record<CardPlaceSize, string> = {
  small: '0.125rem',
  medium: '0.125rem',
  large: '0.25rem',
}

export const mobileBorderBySize: Record<CardPlaceSize, string> = {
  small: '0.125rem',
  medium: '0.125rem',
  large: '0.125rem',
}

const StyledCardPlace = styled('div')<{ size: CardPlaceSize }>(({ size, theme }) => ({
  height: heightByCardSize[size],
  width: widthByCardSize[size],
  borderRadius: '4px',
  border: `white solid ${borderBySize[size]}`,
  position: 'relative',
  [theme.breakpoints.down('lg')]: {
    height: tabletHeightBySize[size],
    width: tabletWidthBySize[size],
    border: `white solid ${mobileBorderBySize[size]}`,
  },
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
  [theme.breakpoints.down('lg')]: {
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
