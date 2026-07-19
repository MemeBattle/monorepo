import { type Ref } from 'react'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { Hotkey } from '#ducks/game'
import { CardsRow } from '../CardsRow'
import { Card } from '../Card'
import { CardHotkeyBadge } from '../CardHotkeyBadge'
import { CardPlace } from '../CardPlace'

export interface CardsStackProps {
  stackOpenDeckCard?: PlayerCard
  stackDeckCards: PlayerCard[]
  onStackOpenDeckCardClick: () => void
  onStackDeckCardClick: () => void
  onStackDeckCardOutsideClick: () => void
  isDndEnabled?: boolean
  isStackOpenDeckSelected: boolean
  isStackOpenDeckDarkened: boolean
  isStackDeckHighlighted?: boolean
  ref?: Ref<HTMLDivElement>
  dataTestId?: string
}

export const CardsStack = ({
  stackOpenDeckCard,
  stackDeckCards,
  onStackOpenDeckCardClick,
  onStackDeckCardClick,
  onStackDeckCardOutsideClick,
  isDndEnabled,
  isStackOpenDeckSelected,
  isStackOpenDeckDarkened,
  isStackDeckHighlighted,
  ref,
  dataTestId,
}: CardsStackProps) => (
  <CardsRow ref={ref} dataTestId={dataTestId}>
    <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.x : undefined}>
      <CardPlace dataTestId={dataTestId ? `${dataTestId}-OpenDeck` : undefined}>
        {stackOpenDeckCard && (
          <Card
            {...stackOpenDeckCard}
            isSelected={isStackOpenDeckSelected}
            isDarkened={isStackOpenDeckDarkened}
            onClick={onStackOpenDeckCardClick}
            onClickOutside={isStackOpenDeckSelected ? onStackDeckCardOutsideClick : undefined}
          />
        )}
      </CardPlace>
    </CardHotkeyBadge>

    <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.space : undefined}>
      <CardPlace dataTestId={dataTestId ? `${dataTestId}-Deck` : undefined}>
        <Card color={stackDeckCards[0]?.color} onClick={onStackDeckCardClick} isHighlighted={isStackDeckHighlighted} />
      </CardPlace>
    </CardHotkeyBadge>
  </CardsRow>
)
