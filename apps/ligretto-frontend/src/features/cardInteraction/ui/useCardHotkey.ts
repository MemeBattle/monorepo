import { useHotkeys } from 'react-hotkeys-hook'

import type { Hotkey } from '#ducks/game'
import { useCardInteractionContext } from './CardInteractionContext'
import { useCardInputEnabled } from './useCardInputEnabled'

export const useCardHotkey = (hotkey: Hotkey | undefined, onActivate: () => void) => {
  const { clearActiveTarget } = useCardInteractionContext()
  const enabled = useCardInputEnabled()
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
