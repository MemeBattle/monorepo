import { styled } from '@mui/material/styles'
import { PositionOnTable } from './types'

const positions = (position: PositionOnTable) => {
  switch (position) {
    case PositionOnTable.Left:
      return {
        left: 50,
        top: '50%',
      }
    case PositionOnTable.Right:
      return {
        right: 50,
        top: '50%',
      }
    case PositionOnTable.LeftTopCorner:
      return {
        left: 0,
        top: 0,
      }
    case PositionOnTable.RightTopCorner:
      return {
        right: 0,
        top: 0,
      }
    case PositionOnTable.Top:
      return {
        display: 'flex',
        justifyContent: 'center',
      }
    case PositionOnTable.Bottom:
      return {
        bottom: 0,
        left: '50%',
      }
  }
}

export const OpponentPosition = styled('div')(({ position }: { position: PositionOnTable }) => ({
  position: position === PositionOnTable.Top ? 'relative' : 'absolute',
  ...positions(position),
}))
