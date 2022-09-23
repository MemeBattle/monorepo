import React from 'react'
import { Card, CardHotkeyBadge } from '@memebattle/ui'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { Hotkey } from 'ducks/game'
import { CardsRow } from 'components/blocks/game/CardsRow'
import { CardPlace } from 'components/blocks/game/CardPlace'

export interface StackProps {
  stackOpenDeckCard?: PlayerCard
  stackDeckCards: PlayerCard[]
  onStackOpenDeckCardClick: () => void
  onStackDeckCardClick: () => void
  onStackDeckCardOutsideClick: () => void
  isDndEnabled: boolean
  isStackOpenDeckSelected: boolean
  isStackOpenDeckDisabled: boolean
}

export const Stack: React.FC<StackProps> = ({
  stackOpenDeckCard,
  stackDeckCards,
  onStackOpenDeckCardClick,
  onStackDeckCardClick,
  onStackDeckCardOutsideClick,
  isDndEnabled,
  isStackOpenDeckSelected,
  isStackOpenDeckDisabled,
}) => (
  <CardsRow>
    <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.x : undefined}>
      <CardPlace>
        {stackOpenDeckCard && (
          <Card
            {...stackOpenDeckCard}
            selected={isStackOpenDeckSelected}
            disabled={isStackOpenDeckDisabled}
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
