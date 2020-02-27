import React from 'react'
import styles from './RoomGrid.module.scss'

export type RenderChildren = (positionOnTable: PositionOnTable) => React.ReactElement

export type RenderMultiplyChildren = [RenderChildren] | [RenderChildren, RenderChildren] | [RenderChildren, RenderChildren, RenderChildren]

export function isMultiplyRenderChildren(arg: RenderMultiplyChildren | RenderChildren[]): arg is RenderMultiplyChildren {
  return arg.length < 4 && arg.length > 0
}

export interface RoomGridProps {
  renderChildren: RenderMultiplyChildren
}

export enum PositionOnTable {
  Left = 'left',
  Right = 'right',
  Top = 'top',
  LeftTopCorner = 'leftTopCorner',
  RightTopCorner = 'rightTopCorner',
}

const stylesByPosition = {
  [PositionOnTable.Left]: styles.left,
  [PositionOnTable.Right]: styles.right,
  [PositionOnTable.LeftTopCorner]: styles.leftTopCorner,
  [PositionOnTable.RightTopCorner]: styles.rightTopCorner,
  [PositionOnTable.Top]: styles.top,
}

export const positionOnTableByIndexByLength = {
  1: [PositionOnTable.Top],
  2: [PositionOnTable.LeftTopCorner, PositionOnTable.RightTopCorner],
  3: [PositionOnTable.Left, PositionOnTable.Top, PositionOnTable.Right],
} as const

export const RoomGrid: React.FC<RoomGridProps> = ({ renderChildren }) => {
  const elementsCount = renderChildren.length

  if (!isMultiplyRenderChildren(renderChildren)) {
    throw Error('renderChildren is not MultiplyRenderChildren')
  }

  return (
    <div className={styles.room}>
      {renderChildren.map((child, index) => {
        const position = positionOnTableByIndexByLength[elementsCount][index]
        return (
          <div className={stylesByPosition[position]} key={index}>
            {child(position)}
          </div>
        )
      })}
    </div>
  )
}
