import type { Meta, StoryObj } from '@storybook/react'
import { Provider } from 'react-redux'
import { GameSettings } from './GameSettings'
import { GameStatus } from '@memebattle/ligretto-shared'
import { createMockStore } from '#testing/lib/createMockStore'

const meta: Meta<typeof GameSettings> = {
  title: 'Ligretto / GameSettings',
  component: GameSettings,
  decorators: [
    Story => (
      <Provider store={createMockStore()}>
        <Story />
      </Provider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof GameSettings>

export const Default: Story = {
  render: () => (
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
  ),
}
