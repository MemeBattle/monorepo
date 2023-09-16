import { Provider } from 'react-redux'

import { GameSettings } from './GameSettings'
import type { Meta } from '@storybook/react'
import { GameStatus } from '@memebattle/ligretto-shared'
import { createMockStore } from 'testing/lib/createMockStore'

export default {
  title: 'Ligretto / GameSettings',
  decorators: [
    Story => (
      <Provider store={createMockStore()}>
        <Story />
      </Provider>
    ),
  ],
} as Meta<typeof GameSettings>

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
