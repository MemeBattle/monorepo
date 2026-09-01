import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { useDispatch } from 'react-redux'

import { Hotkey, tapStackDeckCardAction } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardInteraction } from '#features/cardInteraction'
import { useCardHotkey } from '../../lib/useCardHotkey'

interface PlayerStackDeckProps {
  card?: PlayerCard
  enabled: boolean
  isHidden: boolean
}

export const PlayerStackDeck = ({ card, enabled, isHidden }: PlayerStackDeckProps) => {
  const dispatch = useDispatch()
  const { clearActiveTarget } = useCardInteraction()
  const onStackDeckActivate = () => {
    clearActiveTarget()
    dispatch(tapStackDeckCardAction())
  }

  useCardHotkey(enabled ? Hotkey.space : undefined, onStackDeckActivate)

  return <Card {...card} isHidden={isHidden} onClick={enabled ? onStackDeckActivate : undefined} />
}
