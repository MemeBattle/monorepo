import { useCallback, type Ref } from 'react'
import { canPlaceCardOnDeck, type CardsDeck } from '@memebattle/ligretto-shared'
import last from 'lodash/last'
import { styled } from '@mui/material/styles'

import { Card, CardPlace } from '#entities/card'
import {
  heightByCardSize,
  mobileHeightBySize,
  mobileWidthBySize,
  tabletHeightBySize,
  tabletWidthBySize,
  widthByCardSize,
} from '#entities/card/ui/Card'
import { useDroppableTarget, type CardDragData } from '#features/cardInteraction'

const DropSurface = styled('div')(({ theme }) => ({
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

interface PlaygroundDeckProps {
  cardDeck: CardsDeck | null | undefined
  deckIndex: number
  onClick: () => void
  onDrop?: (dragged: CardDragData) => void
  ref?: Ref<HTMLDivElement>
}

export const PlaygroundDeck = ({ cardDeck, deckIndex, onClick, onDrop = () => undefined, ref }: PlaygroundDeckProps) => {
  const handleDrop = useCallback(
    (dragged: CardDragData) => {
      if (canPlaceCardOnDeck(dragged.card, cardDeck)) {
        onDrop(dragged)
      }
    },
    [cardDeck, onDrop],
  )
  const { activeCard, id: dropId, isOver, setNodeRef } = useDroppableTarget({ type: 'playground', index: deckIndex }, handleDrop)
  const isValid = !!activeCard && canPlaceCardOnDeck(activeCard, cardDeck)
  const card = last(cardDeck?.cards)
  const boxShadow = isValid
    ? isOver
      ? '0 0 0 0.3rem #6ee7a0'
      : '0 0 0 0.2rem rgba(110, 231, 160, 0.7)'
    : isOver
      ? '0 0 0 0.3rem #f87171'
      : undefined

  return (
    <CardPlace size="large" ref={ref} dataTestId={`Playground-Deck-${deckIndex}`}>
      <DropSurface
        ref={setNodeRef}
        data-card-drop-target={dropId}
        data-drop-valid={isValid || undefined}
        data-drop-over={isOver || undefined}
        onClick={onClick}
        style={{ borderRadius: '0.375rem', boxShadow, transition: 'box-shadow 100ms' }}
      >
        {card ? <Card size="large" {...card} /> : null}
      </DropSurface>
    </CardPlace>
  )
}
