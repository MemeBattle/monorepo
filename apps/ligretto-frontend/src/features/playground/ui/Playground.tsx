import { useMemo, type Ref, type RefObject } from 'react'
import type { CardsDeck, Card } from '@memebattle/ligretto-shared'
import last from 'lodash/last'
import { CardPlace, Card as CardComponent } from '#entities/card'
import { TableCards } from './TableCards'
import { PlaygroundDeckDropTarget } from '#features/cardPlacement'

export interface PlaygroundProps {
  cardsDecks: Array<CardsDeck | null>
  onDeckClick: (playgroundDeckIndex: number) => void
  ref?: Ref<HTMLDivElement>
  deckRefs?: Array<RefObject<HTMLDivElement | null> | undefined>
}

const getLastCard = (deck: CardsDeck | null): Card | undefined => last(deck?.cards)

export const Playground = ({ cardsDecks, onDeckClick, ref, deckRefs }: PlaygroundProps) => {
  const cards: (Card | undefined)[] = useMemo(() => {
    const newPlayerCardsArr = []
    for (let i = 0; i < 12; i++) {
      newPlayerCardsArr.push(getLastCard(cardsDecks[i]))
    }
    return newPlayerCardsArr
  }, [cardsDecks])

  return (
    <TableCards ref={ref}>
      {cards.map((card, index) => (
        <PlaygroundDeckDropTarget key={index} deckIndex={index} deck={cardsDecks[index]}>
          <CardPlace size="large" ref={deckRefs?.[index]} dataTestId={`Playground-Deck-${index}`}>
            {card && <CardComponent size="large" {...card} onClick={() => onDeckClick(index)} />}
          </CardPlace>
        </PlaygroundDeckDropTarget>
      ))}
    </TableCards>
  )
}
