import { useHotkeys } from 'react-hotkeys-hook'
import { useDispatch, useSelector } from 'react-redux'

import {
  Hotkey,
  playerCardsSelector,
  playerStackOpenDeckCardsSelector,
  tapCardAction,
  tapLigrettoDeckCardAction,
  tapStackDeckCardAction,
  tapStackOpenDeckCardAction,
} from '#ducks/game'
import { useCardFocus } from '#features/cardFocus'

const rowHotkeyIndices = new Map<string, number>([
  [Hotkey.q, 0],
  [Hotkey.w, 1],
  [Hotkey.e, 2],
  [Hotkey.r, 3],
  [Hotkey.t, 4],
])

export const usePanelHotkeys = ({ enabled }: { enabled: boolean }) => {
  const dispatch = useDispatch()
  const playerCards = useSelector(playerCardsSelector)
  const stackOpenDeckCards = useSelector(playerStackOpenDeckCardsSelector)
  const stackOpenDeckCard = stackOpenDeckCards?.[stackOpenDeckCards.length - 1]
  const { clearFocus, toggleFocus } = useCardFocus()

  useHotkeys(
    Object.values(Hotkey).join(','),
    (event, handler) => {
      event.preventDefault()

      const rowCardIndex = rowHotkeyIndices.get(handler.hotkey)
      if (typeof rowCardIndex === 'number') {
        const card = playerCards?.[rowCardIndex]
        if (!card) {
          clearFocus()
        } else if (card.value === 1 || !enabled) {
          clearFocus()
          dispatch(tapCardAction({ cardIndex: rowCardIndex }))
        } else {
          toggleFocus(`row.${rowCardIndex}`)
        }
        return
      }

      switch (handler.hotkey) {
        case Hotkey.x:
          if (!stackOpenDeckCard) {
            clearFocus()
          } else if (stackOpenDeckCard.value === 1 || !enabled) {
            clearFocus()
            dispatch(tapStackOpenDeckCardAction())
          } else {
            toggleFocus('stack-open')
          }
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
