import { useCallback } from 'react'
import { useDispatch, useSelector, useStore } from 'react-redux'
import { canPlaceCardOnDeck, putCardAction, putCardFromStackOpenDeck, type Card as PlayerCard, type CardsDeck } from '@memebattle/ligretto-shared'
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
import { useDroppableTarget, type CardDragTarget } from '#features/cardInteraction'
import { gameIdSelector, playgroundDecksSelector } from '#ducks/game'
import type { All } from '#types/store'
import { cardByInteractionTarget } from '../../model/cardByInteractionTarget'

const DropSurface = styled('div')(({ theme }) => ({
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

interface PlaygroundDeckProps {
  cardDeck: CardsDeck | null | undefined
  deckIndex: number
}

export const PlaygroundDeck = ({ cardDeck, deckIndex }: PlaygroundDeckProps) => {
  const dispatch = useDispatch()
  const store = useStore<All>()
  const gameId = useSelector(gameIdSelector)
  // Re-read the source and destination from the store at the moment of the move: what sits under a
  // target can change between the gesture and its end.
  const placeCard = useCallback(
    (source: CardDragTarget, expected?: PlayerCard) => {
      const state = store.getState()
      const card = cardByInteractionTarget(state, source)
      if (!card || (expected && (card.color !== expected.color || card.value !== expected.value))) {
        return false
      }
      if (!canPlaceCardOnDeck(card, playgroundDecksSelector(state)[deckIndex])) {
        return false
      }
      if (source.type === 'row') {
        dispatch(putCardAction({ cardIndex: source.index, gameId, playgroundDeckIndex: deckIndex }))
      } else {
        dispatch(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex: deckIndex }))
      }
      return true
    },
    [deckIndex, dispatch, gameId, store],
  )
  const { id: dropId, isOver, onClick, setNodeRef } = useDroppableTarget({ type: 'playground', index: deckIndex }, placeCard)
  const card = last(cardDeck?.cards)

  return (
    <CardPlace size="large" dataTestId={`Playground-Deck-${deckIndex}`}>
      <DropSurface
        ref={setNodeRef}
        data-card-drop-target={dropId}
        data-drop-over={isOver || undefined}
        onClick={onClick}
        // Only the deck under the pointer is outlined. Which decks accept the card is the player's
        // job to see — highlighting them would do the scanning the game is about.
        style={{ boxShadow: isOver ? '0 0 0 0.2rem rgba(255, 255, 255, 0.7)' : undefined }}
      >
        {card ? <Card size="large" {...card} /> : null}
      </DropSurface>
    </CardPlace>
  )
}
