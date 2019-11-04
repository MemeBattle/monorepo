import React from 'react'

import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { Menu } from 'components/blocks/home/menu'
import { UserInfo } from 'components/blocks/home/user-info'
import { HomePageWrapper } from 'components/blocks/home/homepage-wrapper'

const HomePage: React.FC = () => (
  <GameCoverScreen>
    <HomePageWrapper>
      <UserInfo />
      <Menu />
    </HomePageWrapper>
  </GameCoverScreen>
)

export default HomePage
