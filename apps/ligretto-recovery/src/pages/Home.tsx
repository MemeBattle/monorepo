import React from 'react'

import { MainCoverScreen } from 'components/screens/main-cover-screen/MainCoverScreen'
import { Menu } from 'components/blocks/home/menu'
import { UserInfo } from 'components/blocks/home/user-info'
import { HomePageWrapper } from 'components/blocks/home/homepage-wrapper'

export const HomePage: React.FC = () => (
  <MainCoverScreen>
    <HomePageWrapper>
      <UserInfo />
      <Menu />
    </HomePageWrapper>
  </MainCoverScreen>
)
