import type { ReactNode } from 'react'
import React, { isValidElement } from 'react'
import { styled } from '@mui/material/styles'
import { useMediaQuery, useTheme, Box } from '@memebattle/ui'
import { OpponentPosition } from './OpponentPosition'
import { PositionOnTable } from './types'

export type RoomGridProps = {
  children: ReactNode | ReactNode[]
  centerElement?: ReactNode
  bottomElement?: ReactNode
}

const Room = styled('div')(() => ({
  width: '100%',
  height: '100%',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
}))

const positionOnTableByIndexByLength: Record<number, PositionOnTable[] | undefined> = {
  1: [PositionOnTable.Top],
  2: [PositionOnTable.LeftTopCorner, PositionOnTable.RightTopCorner],
  3: [PositionOnTable.Left, PositionOnTable.Top, PositionOnTable.Right],
  4: [PositionOnTable.Left, PositionOnTable.Top, PositionOnTable.Right, PositionOnTable.Bottom],
}

export const DesktopRoomGrid: React.FC<React.PropsWithChildren<RoomGridProps>> = ({ children, centerElement, bottomElement }) => (
  <Room>
    <Box pointerEvents="none">
      {React.Children.map(children, (child, index) => {
        if (!isValidElement(child)) {
          return null
        }
        const renderElementsCount = Math.min(React.Children.count(children), 4)
        const position = positionOnTableByIndexByLength[renderElementsCount]?.[index]

        if (!position) {
          return null
        }

        return (
          <OpponentPosition position={position} key={index}>
            {child}
          </OpponentPosition>
        )
      })}
    </Box>
    {centerElement}
    {bottomElement}
  </Room>
)

const MobileOpponentCardsWrapper = styled('div')<{ index: number }>(({ index }) => ({
  display: 'flex',
  flexDirection: index % 2 === 0 ? 'row' : 'row-reverse',
  alignItems: 'center',
  justifyContent: 'flex-start',
  marginTop: '10px',
}))

export const MobileRoomGrid: React.FC<React.PropsWithChildren<RoomGridProps>> = ({ children, centerElement, bottomElement }) => (
  <Room>
    <Box>
      {React.Children.map(children, (child, index) => {
        if (!isValidElement(child)) {
          return null
        }
        if (index > 4) {
          return null
        }

        return (
          <MobileOpponentCardsWrapper index={index} key={index}>
            {child}
          </MobileOpponentCardsWrapper>
        )
      })}
    </Box>
    {centerElement}
    {bottomElement}
  </Room>
)

export const RoomGrid: React.FC<React.PropsWithChildren<RoomGridProps>> = ({ children, centerElement, bottomElement }) => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return isMobile ? (
    <MobileRoomGrid children={children} centerElement={centerElement} bottomElement={bottomElement} />
  ) : (
    <DesktopRoomGrid children={children} centerElement={centerElement} bottomElement={bottomElement} />
  )
}

RoomGrid.displayName = 'RoomGrid'
