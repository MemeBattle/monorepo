import { useHotkeys } from 'react-hotkeys-hook'

import type { Hotkey } from '#ducks/game'
import { useCardInteraction } from './useCardInteraction'

interface CardHotkeyOptions {
  clearActive?: boolean
}

export const useCardHotkey = (hotkey: Hotkey | undefined, onActivate: () => void, { clearActive = true }: CardHotkeyOptions = {}) => {
  const { clearActiveTarget } = useCardInteraction()
  useHotkeys(
    hotkey ?? '',
    event => {
      event.preventDefault()
      if (clearActive) {
        clearActiveTarget()
      }
      onActivate()
    },
    { enabled: !!hotkey },
  )
}
