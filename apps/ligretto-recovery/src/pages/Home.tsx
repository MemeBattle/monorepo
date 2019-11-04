import React from 'react'

import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { Menu } from 'components/blocks/home/menu'
import { UserInfo } from 'components/blocks/home/user-info'

const HomePage: React.FC = () => (
  <GameCoverScreen>
    <UserInfo />
    <Menu />
  </GameCoverScreen>
)

export default HomePage
