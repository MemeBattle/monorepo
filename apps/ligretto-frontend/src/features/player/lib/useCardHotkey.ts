import { useHotkeys } from 'react-hotkeys-hook'

import type { Hotkey } from '#ducks/game'

export const useCardHotkey = (hotkey: Hotkey | undefined, onActivate: () => void, enabled: boolean) => {
  useHotkeys(
    hotkey ?? '',
    event => {
      event.preventDefault()
      onActivate()
    },
    { enabled: enabled && !!hotkey },
  )
}
