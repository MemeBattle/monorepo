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

      switch (handler.hotkey) {
        case Hotkey.q: {
          const card = playerCards?.[0]
          if (!card) {
            clearFocus()
          } else if (card.value === 1 || !enabled) {
            clearFocus()
            dispatch(tapCardAction({ cardIndex: 0 }))
          } else {
            toggleFocus({ type: 'row', index: 0, card })
          }
          break
        }
        case Hotkey.w: {
          const card = playerCards?.[1]
          if (!card) {
            clearFocus()
          } else if (card.value === 1 || !enabled) {
            clearFocus()
            dispatch(tapCardAction({ cardIndex: 1 }))
          } else {
            toggleFocus({ type: 'row', index: 1, card })
          }
          break
        }
        case Hotkey.e: {
          const card = playerCards?.[2]
          if (!card) {
            clearFocus()
          } else if (card.value === 1 || !enabled) {
            clearFocus()
            dispatch(tapCardAction({ cardIndex: 2 }))
          } else {
            toggleFocus({ type: 'row', index: 2, card })
          }
          break
        }
        case Hotkey.r: {
          const card = playerCards?.[3]
          if (!card) {
            clearFocus()
          } else if (card.value === 1 || !enabled) {
            clearFocus()
            dispatch(tapCardAction({ cardIndex: 3 }))
          } else {
            toggleFocus({ type: 'row', index: 3, card })
          }
          break
        }
        case Hotkey.t: {
          const card = playerCards?.[4]
          if (!card) {
            clearFocus()
          } else if (card.value === 1 || !enabled) {
            clearFocus()
            dispatch(tapCardAction({ cardIndex: 4 }))
          } else {
            toggleFocus({ type: 'row', index: 4, card })
          }
          break
        }
        case Hotkey.x:
          if (!stackOpenDeckCard) {
            clearFocus()
          } else if (stackOpenDeckCard.value === 1 || !enabled) {
            clearFocus()
            dispatch(tapStackOpenDeckCardAction())
          } else {
            toggleFocus({ type: 'open-stack', card: stackOpenDeckCard })
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
