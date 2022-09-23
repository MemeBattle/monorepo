import { styled } from '@mui/material/styles'
import { PositionOnTable } from './types'

const transform = {
  [PositionOnTable.Left]: 'translate(0, -6rem)',
  [PositionOnTable.Right]: 'translate(0, -6rem)',
  [PositionOnTable.LeftTopCorner]: 'scale(0.7)',
  [PositionOnTable.RightTopCorner]: 'scale(0.7)',
  [PositionOnTable.Top]: '',
  [PositionOnTable.Bottom]: '',
}

const transformTablet = {
  [PositionOnTable.Left]: 'scale(0.5) translate(6rem, -6rem)',
  [PositionOnTable.Right]: 'scale(0.5) translate(-6rem, -6rem)',
  [PositionOnTable.LeftTopCorner]: 'scale(0.7)',
  [PositionOnTable.RightTopCorner]: 'scale(0.7)',
  [PositionOnTable.Top]: '',
  [PositionOnTable.Bottom]: '',
}

export const OpponentCardsWrapper = styled('div')<{ position: PositionOnTable }>(({ position, theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  transform: transform[position],
  [theme.breakpoints.between('md', 'lg')]: {
    transform: transformTablet[position],
  },
  [theme.breakpoints.between('sm', 'md')]: {
    transform: 'scale(0.5)',
  },
}))
