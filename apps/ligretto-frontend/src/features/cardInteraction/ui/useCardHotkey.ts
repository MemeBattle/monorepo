import { useHotkeys } from 'react-hotkeys-hook'
import { useCallback } from 'react'

import type { Hotkey } from '#ducks/game'
import { useCardInteractionContext } from './CardInteractionContext'

export const useCardHotkey = (hotkey: Hotkey | undefined, onActivate: () => void) => {
  const { runCommand } = useCardInteractionContext()
  const activate = useCallback(() => runCommand(onActivate), [onActivate, runCommand])
  useHotkeys(
    hotkey ?? '',
    event => {
      event.preventDefault()
      activate()
    },
    { enabled: !!hotkey },
  )
  return activate
}
