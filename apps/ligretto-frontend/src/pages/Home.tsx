import React from 'react'

import { MainLayout } from 'components/layouts/main/MainLayout'
import { Menu } from 'components/blocks/home/menu'
import { HomePageWrapper } from 'components/blocks/home/homepage-wrapper'
import { UserInfoContainer } from 'containers/main-page'

export const HomePage: React.FC = () => (
  <MainLayout>
    <HomePageWrapper>
      <UserInfoContainer />
      <Menu />
    </HomePageWrapper>
  </MainLayout>
)
