// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { resumeGameEmitAction } from '@memebattle/ligretto-shared'

import { createMockStore } from '#testing/lib/createMockStore'
import { addListeners } from './listeners'
import { initialState, resumeGameAction } from './slice'

type ListenerConfig = {
  actionCreator?: { type: string }
  effect?: (action: unknown, listenerApi: { getState: () => unknown; dispatch: (action: unknown) => void }) => void
}

describe('game listeners', () => {
  it('maps the local resume action to the dedicated websocket action', () => {
    const listeners: ListenerConfig[] = []
    addListeners(((config: ListenerConfig) => listeners.push(config)) as never)

    const listener = listeners.find(config => config.actionCreator?.type === resumeGameAction.type)
    const store = createMockStore({
      preloadedState: {
        game: {
          ...initialState,
          game: { ...initialState.game, id: 'paused-game' },
        },
      },
    })
    const dispatch = vi.fn()

    listener?.effect?.(resumeGameAction(), { getState: store.getState, dispatch })

    expect(dispatch).toHaveBeenCalledWith(resumeGameEmitAction({ gameId: 'paused-game' }))
  })
})
