import { type Ref } from 'react'
import CachedIcon from '@mui/icons-material/Cached'
import { styled } from '@mui/material/styles'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { Hotkey } from '#ducks/game'
import { CardsRow } from '../CardsRow'
import { Card } from '../Card'
import { CardHotkeyBadge } from '../CardHotkeyBadge'
import { CardPlace } from '../CardPlace'

/**
 * Shown on the deck place when the face-down deck is exhausted: clicking it
 * turns the open pile over into a fresh deck. Clicks fall through to the
 * (invisible, but clickable) deck card underneath.
 */
const ReshuffleHint = styled('div')(({ theme }) => ({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  pointerEvents: 'none',
  fontSize: '3rem',
  [theme.breakpoints.down('sm')]: {
    fontSize: '2rem',
  },
}))

export interface CardsStackProps {
  stackOpenDeckCard?: PlayerCard
  stackDeckCards: PlayerCard[]
  /** The deck's `isHidden` flag from the game data: the closed pile lies face down. */
  isStackDeckHidden: boolean
  onStackOpenDeckCardClick: () => void
  onStackDeckCardClick: () => void
  isDndEnabled?: boolean
  isStackOpenDeckSelected: boolean
  isStackOpenDeckDarkened: boolean
  isStackDeckHighlighted?: boolean
  markCardsForFocus?: boolean
  ref?: Ref<HTMLDivElement>
  dataTestId?: string
}

export const CardsStack = ({
  stackOpenDeckCard,
  stackDeckCards,
  isStackDeckHidden,
  onStackOpenDeckCardClick,
  onStackDeckCardClick,

  isDndEnabled,
  isStackOpenDeckSelected,
  isStackOpenDeckDarkened,
  isStackDeckHighlighted,
  markCardsForFocus,
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
            dataCardFocusElement={markCardsForFocus}
          />
        )}
      </CardPlace>
    </CardHotkeyBadge>

    <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.space : undefined}>
      <CardPlace dataTestId={dataTestId ? `${dataTestId}-Deck` : undefined}>
        <Card
          {...stackDeckCards[0]}
          isHidden={isStackDeckHidden && stackDeckCards.length > 0}
          onClick={onStackDeckCardClick}
          isHighlighted={isStackDeckHighlighted}
          dataCardFocusElement={markCardsForFocus}
        />
        {stackDeckCards.length === 0 && stackOpenDeckCard ? (
          <ReshuffleHint>
            <CachedIcon fontSize="inherit" />
          </ReshuffleHint>
        ) : null}
      </CardPlace>
    </CardHotkeyBadge>
  </CardsRow>
)
