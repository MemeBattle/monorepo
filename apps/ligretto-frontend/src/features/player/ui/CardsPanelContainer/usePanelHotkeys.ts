import { useHotkeys } from 'react-hotkeys-hook'
import { useDispatch } from 'react-redux'

import { Hotkey, tapLigrettoDeckCardAction, tapStackDeckCardAction } from '#ducks/game'
import { useCardFocus } from '#features/cardFocus'

export const usePanelHotkeys = ({ enabled }: { enabled: boolean }) => {
  const dispatch = useDispatch()
  const { clearFocus, toggleFocus } = useCardFocus()

  useHotkeys(
    Object.values(Hotkey).join(','),
    (event, handler) => {
      event.preventDefault()

      switch (handler.hotkey) {
        case Hotkey.q:
          toggleFocus({ type: 'row', index: 0 })
          break
        case Hotkey.w:
          toggleFocus({ type: 'row', index: 1 })
          break
        case Hotkey.e:
          toggleFocus({ type: 'row', index: 2 })
          break
        case Hotkey.r:
          toggleFocus({ type: 'row', index: 3 })
          break
        case Hotkey.t:
          toggleFocus({ type: 'row', index: 4 })
          break
        case Hotkey.x:
          toggleFocus({ type: 'open-stack' })
          break
        case Hotkey.space:
          clearFocus()
          dispatch(tapStackDeckCardAction())
          break
        case Hotkey.l:
          dispatch(tapLigrettoDeckCardAction())
          break
        case Hotkey.escape:
          clearFocus()
          break
      }
    },
    { enabled },
  )
}
