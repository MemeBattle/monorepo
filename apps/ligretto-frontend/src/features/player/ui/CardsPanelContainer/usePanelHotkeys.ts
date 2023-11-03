import { useHotkeys } from 'react-hotkeys-hook'
import { useDispatch } from 'react-redux'
import {
  Hotkey,
  setSelectedCardIndexAction,
  tapCardAction,
  tapLigrettoDeckCardAction,
  tapStackDeckCardAction,
  tapStackOpenDeckCardAction,
} from '#ducks/game'

export const usePanelHotkeys = ({ enabled }: { enabled?: boolean } = { enabled: true }) => {
  const dispatch = useDispatch()

  useHotkeys(
    Object.values(Hotkey).join(','),
    (e, handler) => {
      e.preventDefault()

      switch (handler.key) {
        case Hotkey.space:
          dispatch(tapStackDeckCardAction())
          break
        case Hotkey.q:
          dispatch(tapCardAction({ cardIndex: 0 }))
          break
        case Hotkey.w:
          dispatch(tapCardAction({ cardIndex: 1 }))
          break
        case Hotkey.e:
          dispatch(tapCardAction({ cardIndex: 2 }))
          break
        case Hotkey.r:
          dispatch(tapCardAction({ cardIndex: 3 }))
          break
        case Hotkey.t:
          dispatch(tapCardAction({ cardIndex: 4 }))
          break
        case Hotkey.x:
          dispatch(tapStackOpenDeckCardAction())
          break
        case Hotkey.l:
          dispatch(tapLigrettoDeckCardAction())
          break
        case Hotkey.escape:
          dispatch(setSelectedCardIndexAction(undefined))
          break
      }
    },
    { enabled },
  )
}
