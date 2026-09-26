import type { Ref, RefObject } from 'react'
import { styled } from '@mui/material/styles'
import last from 'lodash/last'
import { canPlaceCardOnDeck, type Card as PlayerCard, type CardsDeck } from '@memebattle/ligretto-shared'

import { Card, CardPlace } from '#entities/card'
import {
  heightByCardSize,
  mobileHeightBySize,
  mobileWidthBySize,
  tabletHeightBySize,
  tabletWidthBySize,
  widthByCardSize,
} from '#entities/card/ui/Card'
import { getInteractionTargetKey } from '#features/cardInteraction'
import { TableCards } from '#features/playground/ui/TableCards'

const DeckSurface = styled('div')(({ theme }) => ({
  width: widthByCardSize.large,
  height: heightByCardSize.large,
  borderRadius: '0.375rem',
  transition: 'box-shadow 100ms',
  [theme.breakpoints.down('lg')]: {
    width: tabletWidthBySize.large,
    height: tabletHeightBySize.large,
  },
  [theme.breakpoints.down('sm')]: {
    width: mobileWidthBySize.large,
    height: mobileHeightBySize.large,
  },
}))

interface OnboardingPlaygroundProps {
  cardsDecks: Array<CardsDeck | null>
  onDeckClick: (playgroundDeckIndex: number) => void
  /** The card the player has picked, if any — the onboarding points at where it can go. */
  activeCard?: PlayerCard
  ref?: Ref<HTMLDivElement>
  deckRefs?: Array<RefObject<HTMLDivElement | null> | undefined>
}

export const OnboardingPlayground = ({ cardsDecks, onDeckClick, activeCard, ref, deckRefs }: OnboardingPlaygroundProps) => (
  <TableCards ref={ref}>
    {Array.from({ length: 12 }, (_, index) => {
      const card = last(cardsDecks[index]?.cards)
      // A one starts any empty deck, so pointing at every free slot would teach nothing.
      const isDroppable = !!activeCard && activeCard.value !== 1 && canPlaceCardOnDeck(activeCard, cardsDecks[index])
      return (
        <CardPlace key={index} ref={deckRefs?.[index]} size="large" dataTestId={`Playground-Deck-${index}`}>
          <DeckSurface
            data-card-drop-target={getInteractionTargetKey({ type: 'playground', index })}
            data-drop-valid={isDroppable || undefined}
            onClick={() => onDeckClick(index)}
            style={{ boxShadow: isDroppable ? '0 0 0 0.2rem rgba(110, 231, 160, 0.7)' : undefined }}
          >
            {card ? <Card size="large" {...card} /> : null}
          </DeckSurface>
        </CardPlace>
      )
    })}
  </TableCards>
)
