import { useDispatch, useSelector } from 'react-redux'

import { Hotkey, tapStackDeckCardAction } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardHotkey } from '#features/cardInteraction'
import { playerCardsStackSelector } from './PlayerCardsStack.selector'

export const PlayerStackDeck = () => {
  const dispatch = useDispatch()
  const { stackDeckCards } = useSelector(playerCardsStackSelector)
  const hasCards = !!stackDeckCards?.length
  const onStackDeckActivate = () => {
    dispatch(tapStackDeckCardAction())
  }
  useCardHotkey(Hotkey.space, onStackDeckActivate)

  return <Card isHidden={hasCards} onClick={onStackDeckActivate} />
}
