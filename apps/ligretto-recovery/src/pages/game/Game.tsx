import React from 'react'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { GamePage as GamePageContainer } from 'containers/game-page'

export const GamePage: React.FC = () => (
  <GameCoverScreen>
    <GamePageContainer />
  </GameCoverScreen>
)
