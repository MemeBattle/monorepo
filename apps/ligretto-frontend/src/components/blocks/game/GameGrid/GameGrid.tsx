import type { ReactNode } from 'react'
import React from 'react'
import { styled } from '@mui/material/styles'
import { useMediaQuery, useTheme, Box } from '@memebattle/ui'

export type RoomGridProps = {
  children?: ReactNode | ReactNode[]
  centerElement?: ReactNode
  bottomElement?: ReactNode
}

const Room = styled('div')(() => ({
  width: '100%',
  height: '100%',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
}))

const GameGridContainer = styled('div')(() => ({
  height: '100%',
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: 'minmax(10rem, auto) max-content minmax(10rem, auto)',
  gridTemplateRows: 'minmax(min-content, max-content) auto minmax(min-content, max-content)',
  gridTemplateAreas: '"top top top" "middleLeft middleCenter middleRight" "bottom bottom bottom"',
  alignItems: 'center',
  justifyItems: 'center',
}))

export const DesktopGameGrid: React.FC<React.PropsWithChildren<RoomGridProps>> = ({ children, centerElement, bottomElement }) => {
  const opponentsArray = React.Children.map(children, child => child)

  const hasTopElement = opponentsArray?.length === 1 || opponentsArray?.length === 3 || opponentsArray?.length === 4

  return (
    <GameGridContainer>
      {hasTopElement ? (
        <Box alignSelf="center" justifySelf="center" gridArea="top">
          {opponentsArray?.length === 1 || opponentsArray?.length === 3 || opponentsArray?.length === 4 ? opponentsArray[0] : null}
        </Box>
      ) : null}
      <Box gridArea="middleLeft">{opponentsArray && opponentsArray.length > 1 && opponentsArray[opponentsArray?.length === 3 ? 1 : 0]}</Box>
      <Box gridArea="middleCenter">{centerElement}</Box>
      <Box gridArea="middleRight">{opponentsArray && opponentsArray.length > 1 && opponentsArray[opponentsArray?.length === 3 ? 2 : 1]}</Box>
      <Box alignSelf="end" justifySelf="center" gridArea="bottom">
        {bottomElement || (opponentsArray?.length === 4 ? opponentsArray[3] : null)}
      </Box>
    </GameGridContainer>
  )
}

const MobileOpponentCardsWrapper = styled('div')<{ index: number }>(({ index }) => ({
  display: 'flex',
  flexDirection: index % 2 === 0 ? 'row' : 'row-reverse',
  alignItems: 'center',
  justifyContent: 'flex-start',
  marginTop: '10px',
}))

export const MobileGameGrid: React.FC<React.PropsWithChildren<RoomGridProps>> = ({ children, centerElement, bottomElement }) => (
  <Room>
    {React.Children.map(children, (child, index) => (
      <MobileOpponentCardsWrapper index={index} key={index}>
        {child}
      </MobileOpponentCardsWrapper>
    ))}
    {centerElement}
    {bottomElement}
  </Room>
)

export const GameGrid: React.FC<React.PropsWithChildren<RoomGridProps>> = ({ children, centerElement, bottomElement }) => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return isMobile ? (
    <MobileGameGrid children={children} centerElement={centerElement} bottomElement={bottomElement} />
  ) : (
    <DesktopGameGrid children={children} centerElement={centerElement} bottomElement={bottomElement} />
  )
}

GameGrid.displayName = 'GameGrid'
