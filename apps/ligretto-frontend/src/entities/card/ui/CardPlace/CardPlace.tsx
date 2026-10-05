import { type PropsWithChildren, type Ref } from 'react'
import { styled } from '@mui/material/styles'

import { widthByCardSize, heightByCardSize, mobileHeightBySize, mobileWidthBySize, tabletWidthBySize, tabletHeightBySize } from '../Card'

export type CardPlaceSize = 'small' | 'medium' | 'large'

export interface CardPlaceProps {
  [dataAttribute: `data-${string}`]: string | boolean | undefined
  size?: CardPlaceSize
  /** A place that handles clicks is the click target itself, and looks like one even when empty. */
  onClick?: () => void
  /** Marks the place as a destination the current card can go to. */
  isHighlighted?: boolean
  ref?: Ref<HTMLDivElement>
  dataTestId?: string
}

const borderBySize: Record<CardPlaceSize, string> = {
  small: '0.125rem',
  medium: '0.125rem',
  large: '0.25rem',
}

const mobileBorderBySize: Record<CardPlaceSize, string> = {
  small: '0.125rem',
  medium: '0.125rem',
  large: '0.125rem',
}

const StyledCardPlace = styled('div')<{ size: CardPlaceSize; isClickable?: boolean; isHighlighted?: boolean }>(
  ({ size, isClickable, isHighlighted, theme }) => ({
    height: heightByCardSize[size],
    width: widthByCardSize[size],
    borderRadius: '4px',
    border: `white solid ${borderBySize[size]}`,
    position: 'relative',
    cursor: isClickable ? 'pointer' : undefined,
    boxShadow: isHighlighted ? '0 0 0 0.25rem rgb(110, 231, 160), 0 0 1.25rem 0.25rem rgba(110, 231, 160, 0.8)' : undefined,
    transition: 'box-shadow 100ms',
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
  }),
)

const StyledCard = styled('div')<{ size: CardPlaceSize }>(({ size, theme }) => ({
  position: 'absolute',
  top: `-${borderBySize[size]}`,
  left: `-${borderBySize[size]}`,
  [theme.breakpoints.down('lg')]: {
    top: `-${mobileBorderBySize[size]}`,
    left: `-${mobileBorderBySize[size]}`,
  },
}))

export const CardPlace = ({ children, size = 'medium', onClick, isHighlighted, ref, dataTestId, ...rest }: PropsWithChildren<CardPlaceProps>) => (
  <StyledCardPlace {...rest} ref={ref} size={size} isClickable={!!onClick} isHighlighted={isHighlighted} onClick={onClick} data-test-id={dataTestId}>
    <StyledCard size={size}>{children}</StyledCard>
  </StyledCardPlace>
)
