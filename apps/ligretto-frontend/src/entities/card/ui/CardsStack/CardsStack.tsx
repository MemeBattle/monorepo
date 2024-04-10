import React from 'react'
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
  isDndEnabled: boolean
  isStackOpenDeckSelected: boolean
  isStackOpenDeckDarkened: boolean
}

export const CardsStack: React.FC<CardsStackProps> = ({
  stackOpenDeckCard,
  stackDeckCards,
  onStackOpenDeckCardClick,
  onStackDeckCardClick,
  onStackDeckCardOutsideClick,
  isDndEnabled,
  isStackOpenDeckSelected,
  isStackOpenDeckDarkened,
}) => (
  <CardsRow>
    <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.x : undefined}>
      <CardPlace>
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
      <CardPlace>
        <Card color={stackDeckCards[0]?.color} onClick={onStackDeckCardClick} />
      </CardPlace>
    </CardHotkeyBadge>
  </CardsRow>
)
