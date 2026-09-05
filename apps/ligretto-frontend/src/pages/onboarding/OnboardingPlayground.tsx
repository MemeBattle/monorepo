import type { Ref, RefObject } from 'react'
import { styled } from '@mui/material/styles'
import last from 'lodash/last'
import type { CardsDeck } from '@memebattle/ligretto-shared'

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
  ref?: Ref<HTMLDivElement>
  deckRefs?: Array<RefObject<HTMLDivElement | null> | undefined>
}

export const OnboardingPlayground = ({ cardsDecks, onDeckClick, ref, deckRefs }: OnboardingPlaygroundProps) => (
  <TableCards ref={ref}>
    {Array.from({ length: 12 }, (_, index) => {
      const card = last(cardsDecks[index]?.cards)
      return (
        <CardPlace key={index} ref={deckRefs?.[index]} size="large" dataTestId={`Playground-Deck-${index}`}>
          <DeckSurface data-card-drop-target={getInteractionTargetKey({ type: 'playground', index })} onClick={() => onDeckClick(index)}>
            {card ? <Card size="large" {...card} /> : null}
          </DeckSurface>
        </CardPlace>
      )
    })}
  </TableCards>
)
