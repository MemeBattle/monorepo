import type { Ref } from 'react'
import type { CardsDeck } from '@memebattle/ligretto-shared'
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
import { useDroppableCard, type CardDragData } from '#features/cardInteraction'

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
  const dropId = `playground.${deckIndex}`
  const { isOver, isValid, setNodeRef } = useDroppableCard(dropId, cardDeck, onDrop)
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
