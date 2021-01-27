import React from 'react'

import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { Menu } from 'components/blocks/home/menu'
import { HomePageWrapper } from 'components/blocks/home/homepage-wrapper'
import { UserInfoContainer } from 'containers/main-page'

export const HomePage: React.FC = () => (
  <GameCoverScreen>
    <HomePageWrapper>
      <UserInfoContainer />
      <Menu />
    </HomePageWrapper>
  </GameCoverScreen>
)
