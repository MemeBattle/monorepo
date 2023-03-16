import React from 'react'

import { MainLayout } from 'components/layouts/main/MainLayout'
import { GamePageContainer } from 'containers/GamePageContainer'

export const GamePage: React.FC = () => (
  <MainLayout>
    <GamePageContainer />
  </MainLayout>
)
