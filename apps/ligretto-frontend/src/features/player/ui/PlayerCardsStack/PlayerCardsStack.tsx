import { CardsRow } from '#entities/card/ui/CardsRow'
import { PlayerStackDeck } from './PlayerStackDeck'
import { PlayerStackOpenDeck } from './PlayerStackOpenDeck'

export const PlayerCardsStack = () => (
  <CardsRow>
    <PlayerStackOpenDeck />
    <PlayerStackDeck />
  </CardsRow>
)
