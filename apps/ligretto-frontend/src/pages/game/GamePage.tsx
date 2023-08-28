import React from 'react'

import { MainLayout } from 'components/layouts/main/MainLayout'
import { GamePageContainer } from 'containers/GamePageContainer'
import { GameLayout } from 'components/layouts/game/GameLayout'

export const GamePage: React.FC = () => (
  <GameLayout height="100">
    <MainLayout>
      <GamePageContainer />
    </MainLayout>
  </GameLayout>
)
