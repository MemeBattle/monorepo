import React from 'react'

import HomeHeader from 'components/blocks/home/HomeHeader'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { Menu } from 'components/blocks/menu'

const HomePage: React.FC = () => (
  <GameCoverScreen>
    <HomeHeader />
    <Menu />
  </GameCoverScreen>
)

export default HomePage
