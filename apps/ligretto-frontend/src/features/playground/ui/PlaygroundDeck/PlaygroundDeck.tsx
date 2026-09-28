import { useCallback } from 'react'
import { useDispatch, useSelector, useStore } from 'react-redux'
import { canPlaceCardOnDeck, putCardAction, putCardFromStackOpenDeck, type Card as PlayerCard, type CardsDeck } from '@memebattle/ligretto-shared'
import last from 'lodash/last'
import { Card, CardPlace } from '#entities/card'
import { useDroppableTarget, type CardDragTarget } from '#features/cardInteraction'
import { gameIdSelector, playgroundDecksSelector } from '#ducks/game'
import type { All } from '#types/store'
import { cardByInteractionTarget } from '../../model/cardByInteractionTarget'

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
        return
      }
      if (!canPlaceCardOnDeck(card, playgroundDecksSelector(state)[deckIndex])) {
        return
      }
      if (source.type === 'row') {
        dispatch(putCardAction({ cardIndex: source.index, gameId, playgroundDeckIndex: deckIndex }))
      } else {
        dispatch(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex: deckIndex }))
      }
    },
    [deckIndex, dispatch, gameId, store],
  )
  const { id: dropId, onClick, setNodeRef } = useDroppableTarget({ type: 'playground', index: deckIndex }, placeCard)
  const card = last(cardDeck?.cards)

  return (
    <CardPlace
      ref={setNodeRef}
      size="large"
      dataTestId={`Playground-Deck-${deckIndex}`}
      onClick={onClick}
      data-card-drop-target={dropId}
      data-card-interaction-element
    >
      {card ? <Card size="large" {...card} /> : null}
    </CardPlace>
  )
}
