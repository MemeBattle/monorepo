import React from 'react'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { CardsPanel } from 'components/blocks/cards-panel'
import { OpponentCards, PositionOnTable } from 'components/blocks/opponent-cards'
import { TableCards } from 'components/blocks/table-cards'

export const GamePage: React.FC = () => (
  <GameCoverScreen>
    <OpponentCards positionOnTable={PositionOnTable.LeftTopCorner} />
    <OpponentCards positionOnTable={PositionOnTable.RightTopCorner} />
    <TableCards />
    <CardsPanel />
  </GameCoverScreen>
)
