import React, { useRef } from 'react'
import { CardColors } from '@memebattle/ligretto-shared'
import { ButtonBase } from '@mui/material'
import { Typography, useOnClickOutside } from '@memebattle/ui'
import { styled } from '@mui/material/styles'
import type { CardPlaceSize } from '../CardPlace'

type CardSize = 'small' | 'medium' | 'large'

interface CardProps {
  /** Color of card **/
  color?: CardColors
  /** Value of card **/
  value?: number
  /** Selected state of card **/
  isSelected?: boolean
  /** Disabled state of card **/
  isDisabled?: boolean
  /** Darkened state of card (E.x. when other card selected) **/
  isDarkened?: boolean
  /** Callback on click outside **/
  onClick?: () => void
  /** Callback on click **/
  onClickOutside?: () => void
  /** Size of card **/
  size?: CardSize
}

export const widthByCardSize: Record<CardSize, string> = {
  small: '3.875rem',
  medium: '6.125rem',
  large: '7.5rem',
}

export const heightByCardSize: Record<CardSize, string> = {
  small: '5.5rem',
  medium: '8.5rem',
  large: '10.75rem',
}

export const tabletHeightBySize: Record<CardPlaceSize, string> = {
  small: '4.375rem',
  medium: '5.875rem',
  large: '8rem',
}

export const tabletWidthBySize: Record<CardPlaceSize, string> = {
  small: '3.125rem',
  medium: '4.25rem',
  large: '5.75rem',
}

export const mobileHeightBySize: Record<CardPlaceSize, string> = {
  small: '3.125rem',
  medium: '4.125rem',
  large: '4.75rem',
}

export const mobileWidthBySize: Record<CardPlaceSize, string> = {
  small: '2.25rem',
  medium: '2.875rem',
  large: '3.5rem',
}

const fontSizeByCardSize: Record<CardSize, string> = {
  small: '3rem',
  medium: '6rem',
  large: '8rem',
}

const tabletFontSizeByCardSize: Record<CardSize, string> = {
  small: '2.5rem',
  medium: '4rem',
  large: '5rem',
}

const mobileFontSizeByCardSize: Record<CardSize, string> = {
  small: '2rem',
  medium: '3rem',
  large: '4rem',
}

const colorByCardColors: Record<CardColors, string> = {
  [CardColors.green]: '#2FB166',
  [CardColors.red]: '#F12F2F',
  [CardColors.yellow]: '#F5CF0E',
  [CardColors.blue]: '#29A7DD',
  [CardColors.empty]: 'transparent',
}

const StyledCardNotForwardedPropsSet = new Set<PropertyKey>(['isDarkened', 'isDisabled', 'isSelected', 'size'])

const StyledCard = styled(ButtonBase, { shouldForwardProp: prop => !StyledCardNotForwardedPropsSet.has(prop) })<{
  color: CardColors
  ref: React.RefObject<HTMLButtonElement>
  isDisabled?: boolean
  isSelected?: boolean
  isDarkened?: boolean
  size: CardSize
}>(({ color, isDisabled, isSelected, isDarkened, size, theme }) => ({
  height: heightByCardSize[size],
  width: widthByCardSize[size],
  opacity: color === CardColors.empty ? 0 : 1,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  userSelect: 'none',
  background: color ? colorByCardColors[color] : colorByCardColors.empty,
  color: '#fff',
  fontSize: fontSizeByCardSize[size],
  filter: isDarkened ? 'grayscale(50%) brightness(0.95)' : 'none',
  cursor: isDisabled ? 'default' : 'pointer',
  transition: 'box-shadow 100ms',
  ':hover': {
    boxShadow: isDisabled ? undefined : `0.1rem 0.1rem 0.8rem ${isSelected ? 'rgba(255,255,255,0.7)' : 'rgba(0, 0, 0, 0.5)'} `,
  },
  boxShadow: isSelected ? '0.1rem 0.1rem 0.8rem rgba(255,255,255,0.7)' : undefined,
  [theme.breakpoints.down('lg')]: {
    height: tabletHeightBySize[size],
    width: tabletWidthBySize[size],
    fontSize: tabletFontSizeByCardSize[size],
  },
  [theme.breakpoints.down('sm')]: {
    height: mobileHeightBySize[size],
    width: mobileWidthBySize[size],
    fontSize: mobileFontSizeByCardSize[size],
  },
  borderRadius: '0.25rem',
}))

const StyledCardValue = styled(Typography)(() => ({
  fontSize: 'inherit',
}))

export const Card: React.FC<CardProps> = ({
  value,
  isDisabled = false,
  isSelected,
  isDarkened,
  onClick,
  onClickOutside,
  color = CardColors.empty,
  size = 'medium',
}) => {
  const ref = useRef<HTMLButtonElement>(null)

  useOnClickOutside(ref, onClickOutside)

  return (
    <StyledCard
      isDarkened={isDarkened}
      disableRipple={isDisabled}
      size={size}
      onMouseDown={onClick}
      isDisabled={isDisabled}
      isSelected={isSelected}
      color={color}
      ref={ref}
    >
      <StyledCardValue component="span">{value}</StyledCardValue>
    </StyledCard>
  )
}

Card.displayName = 'Card'
