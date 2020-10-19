import React, { useMemo } from 'react'
import { createStyles, makeStyles } from '@material-ui/core'

export type RenderChildren = (positionOnTable: PositionOnTable) => React.ReactElement

export type RenderMultiplyChildren = [RenderChildren] | [RenderChildren, RenderChildren] | [RenderChildren, RenderChildren, RenderChildren]

export function isMultiplyRenderChildren(arg: RenderMultiplyChildren | RenderChildren[]): arg is RenderMultiplyChildren {
  return arg.length > 0 && arg.length < 4
}

export interface RoomGridProps {
  renderChildren: RenderChildren[]
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

const positionOnTableByIndexByLength = {
  1: [PositionOnTable.Top],
  2: [PositionOnTable.LeftTopCorner, PositionOnTable.RightTopCorner],
  3: [PositionOnTable.Left, PositionOnTable.Top, PositionOnTable.Right],
} as const

export const RoomGrid: React.FC<RoomGridProps> = ({ renderChildren }) => {
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
      {renderChildren && renderChildren.length !== 0 && isMultiplyRenderChildren(renderChildren)
        ? renderChildren.map((child, index) => {
            const renderElementsCount = renderChildren.length
            const position = positionOnTableByIndexByLength[renderElementsCount][index]
            return (
              <div className={stylesByPosition[position]} key={index}>
                {child(position)}
              </div>
            )
          })
        : null}
    </div>
  )
}
RoomGrid.displayName = 'RoomGrid'
