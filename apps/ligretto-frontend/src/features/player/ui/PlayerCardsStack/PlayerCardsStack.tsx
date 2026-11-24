import { CardsRow } from '#entities/card/ui/CardsRow'
import { PlayerStackDeck } from './PlayerStackDeck'
import { PlayerStackOpenDeck } from './PlayerStackOpenDeck'
import { StackTurnProvider } from './StackTurnProvider'

export const PlayerCardsStack = () => (
  <StackTurnProvider>
    <CardsRow>
      <PlayerStackOpenDeck />
      <PlayerStackDeck />
    </CardsRow>
  </StackTurnProvider>
)
