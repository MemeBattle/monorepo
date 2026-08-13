import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { useDispatch } from 'react-redux'

import { tapStackDeckCardAction } from '#ducks/game'
import { Card } from '#entities/card'

interface PlayerStackDeckProps {
  card?: PlayerCard
  isHidden: boolean
}

export const PlayerStackDeck = ({ card, isHidden }: PlayerStackDeckProps) => {
  const dispatch = useDispatch()

  return <Card {...card} isHidden={isHidden} onClick={() => dispatch(tapStackDeckCardAction())} />
}
