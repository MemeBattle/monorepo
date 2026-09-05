import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { useDispatch } from 'react-redux'

import { Hotkey, tapStackDeckCardAction } from '#ducks/game'
import { Card } from '#entities/card'
import { useCardHotkey, useCardAction } from '#features/cardInteraction'

interface PlayerStackDeckProps {
  card?: PlayerCard
  enabled: boolean
  isHidden: boolean
}

export const PlayerStackDeck = ({ card, enabled, isHidden }: PlayerStackDeckProps) => {
  const dispatch = useDispatch()
  const onStackDeckActivate = () => {
    dispatch(tapStackDeckCardAction())
  }

  useCardHotkey(enabled ? Hotkey.space : undefined, onStackDeckActivate)

  const activate = useCardAction(onStackDeckActivate, enabled)

  return <Card {...card} isHidden={isHidden} onClick={activate} />
}
