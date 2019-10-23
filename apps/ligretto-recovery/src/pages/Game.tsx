import React from 'react'
import HomeHeader from 'components/blocks/home/HomeHeader'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { CardsPanel } from 'components/blocks/cards-panel'
import { OpponentCards } from 'components/blocks/opponent-cards'
import { TableCards } from 'components/blocks/table-cards'

const HomePage: React.FC = () => (
  <GameCoverScreen>
    <HomeHeader />
    <OpponentCards />
    <OpponentCards />
    <TableCards />
    <CardsPanel />
  </GameCoverScreen>
)

export default HomePage
