import { useDispatch, useSelector } from 'react-redux'

import { Hotkey, tapStackDeckCardAction } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardHotkey } from '#features/cardInteraction'
import { playerCardsStackSelector } from './PlayerCardsStack.selector'

export const PlayerStackDeck = () => {
  const dispatch = useDispatch()
  const { stackDeckCards, stackOpenDeckCard } = useSelector(playerCardsStackSelector)
  const hasCards = !!stackDeckCards?.length
  const available = hasCards || !!stackOpenDeckCard
  const onStackDeckActivate = () => {
    if (available) {
      dispatch(tapStackDeckCardAction())
    }
  }
  const activate = useCardHotkey(available ? Hotkey.space : undefined, onStackDeckActivate)

  return <Card isHidden={hasCards} onClick={available ? activate : undefined} />
}
