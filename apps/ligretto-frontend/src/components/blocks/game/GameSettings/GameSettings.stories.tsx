import { Provider } from 'react-redux'

import { GameSettings } from './GameSettings'
import type { ComponentMeta } from '@storybook/react'
import { GameStatus } from '@memebattle/ligretto-shared'
import { createStoreForStories } from 'utils/createStoreForStories'

export default {
  title: 'Ligretto / GameSettings',
  decorators: [
    Story => (
      <Provider store={createStoreForStories()}>
        <Story />
      </Provider>
    ),
  ],
} as ComponentMeta<typeof GameSettings>

export const Default = () => (
  <div style={{ height: '44rem', width: '44rem', display: 'flex' }}>
    <GameSettings
      isPlayerReadyToPlay={false}
      isButtonDisabled
      gameName="GameName"
      gameStatus={GameStatus.Pause}
      canStartGame
      onReadyClick={() => void 0}
      onExitClick={() => void 0}
      onStartClick={() => void 0}
    />
  </div>
)
