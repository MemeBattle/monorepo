import { useHotkeys } from 'react-hotkeys-hook'

import type { Hotkey } from '#ducks/game'
import { useCardInteractionContext } from './CardInteractionContext'

export const useCardHotkey = (hotkey: Hotkey | undefined, onActivate: () => void) => {
  const { enabled, clearActiveTarget } = useCardInteractionContext()
  useHotkeys(
    hotkey ?? '',
    event => {
      event.preventDefault()
      clearActiveTarget()
      onActivate()
    },
    { enabled: enabled && !!hotkey },
  )
}
