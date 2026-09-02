import { useHotkeys } from 'react-hotkeys-hook'

import type { Hotkey } from '#ducks/game'
import { useCardInteraction } from './useCardInteraction'

export const useCardHotkey = (hotkey: Hotkey | undefined, onActivate: () => void) => {
  const { clearActiveTarget } = useCardInteraction()
  useHotkeys(
    hotkey ?? '',
    event => {
      event.preventDefault()
      clearActiveTarget()
      onActivate()
    },
    { enabled: !!hotkey },
  )
}
