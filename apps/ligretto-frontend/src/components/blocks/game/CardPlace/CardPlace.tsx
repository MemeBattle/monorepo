import React from 'react'
import { styled } from '@mui/material/styles'
import { useMediaQuery, useTheme } from '@memebattle/ui'

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

const StyledCardPlace = styled('div')<{ size: CardPlaceSize; isMobile: boolean }>(({ size, isMobile }) => ({
  height: isMobile ? mobileHeightBySize[size] : heightBySize[size],
  width: isMobile ? mobileWidthBySize[size] : widthBySize[size],
  borderRadius: '4px',
  border: `white solid ${isMobile ? mobileBorderBySize[size] : borderBySize[size]}`,
  position: 'relative',
}))

export const topBySize: Record<CardPlaceSize, string> = {
  medium: '-0.75rem',
  large: '-0.25rem',
}

export const mobileTopBySize: Record<CardPlaceSize, string> = {
  medium: '-0.75rem',
  large: '-0.125rem',
}

export const leftBySize: Record<CardPlaceSize, string> = {
  medium: '-0.75rem',
  large: '-0.25rem',
}

export const mobileLeftBySize: Record<CardPlaceSize, string> = {
  medium: '-0.75rem',
  large: '-0.125rem',
}

const StyledCard = styled('div')<{ size: CardPlaceSize; isMobile: boolean }>(({ size, isMobile }) => ({
  position: 'absolute',
  top: isMobile ? mobileTopBySize[size] : topBySize[size],
  left: isMobile ? mobileLeftBySize[size] : leftBySize[size],
}))

export const CardPlace: React.FC<CardPlaceProps> = ({ children, size = 'medium' }) => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <StyledCardPlace size={size} isMobile={isMobile}>
      <StyledCard size={size} isMobile={isMobile}>
        {children}
      </StyledCard>
    </StyledCardPlace>
  )
}

CardPlace.displayName = 'CardPlace'
