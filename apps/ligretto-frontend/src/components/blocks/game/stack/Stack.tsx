import React from 'react'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { Hotkey } from 'ducks/game'
import { CardsRow } from 'components/blocks/game/CardsRow'
import { CardPlace } from 'components/blocks/game/CardPlace'
import { Card } from 'components/blocks/game/Card'
import { CardHotkeyBadge } from 'components/blocks/game/CardHotkeyBadge'
import { StubCard } from 'components/blocks/game/Card'

export interface StackProps {
  stackOpenDeckCard?: PlayerCard
  stackDeckCards: PlayerCard[]
  onStackOpenDeckCardClick: () => void
  onStackDeckCardClick: () => void
  onStackDeckCardOutsideClick: () => void
  isDndEnabled: boolean
  isStackOpenDeckSelected: boolean
  isStackOpenDeckDarkened: boolean
}

export const Stack: React.FC<StackProps> = ({
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
    <CardPlace>
      <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.x : undefined}>
        {stackOpenDeckCard ? (
          <Card
            {...stackOpenDeckCard}
            isSelected={isStackOpenDeckSelected}
            isDarkened={isStackOpenDeckDarkened}
            onClick={onStackOpenDeckCardClick}
            onClickOutside={isStackOpenDeckSelected ? onStackDeckCardOutsideClick : undefined}
          />
        ) : (
          <StubCard />
        )}
      </CardHotkeyBadge>
    </CardPlace>
    <CardPlace>
      <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.space : undefined}>
        <Card color={stackDeckCards[0]?.color} onClick={onStackDeckCardClick} />
      </CardHotkeyBadge>
    </CardPlace>
  </CardsRow>
)
