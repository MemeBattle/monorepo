import React from 'react'
import { GamePageContainer } from 'containers/GamePageContainer'
import { GameLayout } from 'components/layouts/game/GameLayout'

export const GamePage: React.FC = () => (
  <GameLayout>
    <GamePageContainer />
  </GameLayout>
)
