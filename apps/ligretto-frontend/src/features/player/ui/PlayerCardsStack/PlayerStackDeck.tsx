import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { useDispatch } from 'react-redux'

import { Hotkey, tapStackDeckCardAction } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardFocus } from '#features/cardFocus'
import { useCardHotkey } from '../../lib/useCardHotkey'

interface PlayerStackDeckProps {
  card?: PlayerCard
  enabled: boolean
  isHidden: boolean
}

export const PlayerStackDeck = ({ card, enabled, isHidden }: PlayerStackDeckProps) => {
  const dispatch = useDispatch()
  const { clearFocus } = useCardFocus()
  const onStackDeckActivate = () => {
    clearFocus()
    dispatch(tapStackDeckCardAction())
  }

  useCardHotkey(Hotkey.space, onStackDeckActivate, enabled)

  return <Card {...card} isHidden={isHidden} onClick={enabled ? onStackDeckActivate : undefined} />
}
