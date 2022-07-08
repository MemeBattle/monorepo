import type { ReactNode } from 'react'
import React, { useMemo, cloneElement, isValidElement } from 'react'
import { createStyles, makeStyles } from '@mui/styles'

export type RoomGridProps = {
  children: ReactNode | ReactNode[]
}

const useStyles = makeStyles(
  createStyles({
    room: {
      width: '100%',
      height: '100%',
      position: 'absolute',
      pointerEvents: 'none',
    },
    left: {
      position: 'absolute',
      left: 0,
      top: '50%',
    },
    right: {
      position: 'absolute',
      right: 0,
      top: '50%',
    },
    top: {
      position: 'absolute',
      left: '50%',
    },
    leftTopCorner: {
      position: 'absolute',
      left: 0,
      top: 0,
    },
    rightTopCorner: {
      position: 'absolute',
      right: 0,
      top: 0,
    },
  }),
)

export enum PositionOnTable {
  Left = 'left',
  Right = 'right',
  Top = 'top',
  LeftTopCorner = 'leftTopCorner',
  RightTopCorner = 'rightTopCorner',
}

const positionOnTableByIndexByLength: Record<number, PositionOnTable[] | undefined> = {
  1: [PositionOnTable.Top],
  2: [PositionOnTable.LeftTopCorner, PositionOnTable.RightTopCorner],
  3: [PositionOnTable.Left, PositionOnTable.Top, PositionOnTable.Right],
}

export const RoomGrid: React.FC<RoomGridProps> = ({ children }) => {
  const classes = useStyles()

  const stylesByPosition = useMemo(
    () => ({
      [PositionOnTable.Left]: classes.left,
      [PositionOnTable.Right]: classes.right,
      [PositionOnTable.LeftTopCorner]: classes.leftTopCorner,
      [PositionOnTable.RightTopCorner]: classes.rightTopCorner,
      [PositionOnTable.Top]: classes.top,
    }),
    [classes],
  )

  return (
    <div className={classes.room}>
      {React.Children.map(children, (child, index) => {
        if (!isValidElement(child)) {
          return null
        }
        const renderElementsCount = Math.min(React.Children.count(children), 3)
        const position = positionOnTableByIndexByLength[renderElementsCount]?.[index]

        if (!position) {
          return null
        }

        return (
          <div className={stylesByPosition[position]} key={index}>
            {cloneElement(child, { position })}
          </div>
        )
      })}
    </div>
  )
}
RoomGrid.displayName = 'RoomGrid'
