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
import { useDroppableCard, type CardDragData } from '#features/cardPlacement'

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
  const droppable = useDroppableCard(`playground.${deckIndex}`, cardDeck, onDrop)
  const card = last(cardDeck?.cards)

  return (
    <CardPlace size="large" ref={ref} dataTestId={`Playground-Deck-${deckIndex}`}>
      <DropSurface {...droppable}>{card ? <Card size="large" {...card} onClick={onClick} /> : null}</DropSurface>
    </CardPlace>
  )
}
