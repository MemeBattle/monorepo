import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { putCardAction, putCardFromStackOpenDeck, type CardsDeck } from '@memebattle/ligretto-shared'
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
import { useCardInteraction, useDroppableTarget, type CardDragData } from '#features/cardInteraction'
import { gameIdSelector } from '#ducks/game'

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
}

export const PlaygroundDeck = ({ cardDeck, deckIndex }: PlaygroundDeckProps) => {
  const dispatch = useDispatch()
  const gameId = useSelector(gameIdSelector)
  const { activeTarget } = useCardInteraction()
  const placeCard = useCallback(
    (target: CardDragData['target']) => {
      if (target.type === 'row') {
        dispatch(putCardAction({ cardIndex: target.index, gameId, playgroundDeckIndex: deckIndex }))
      } else {
        dispatch(putCardFromStackOpenDeck({ gameId, playgroundDeckIndex: deckIndex }))
      }
    },
    [deckIndex, dispatch, gameId],
  )
  const {
    id: dropId,
    isOver,
    isValid,
    setNodeRef,
  } = useDroppableTarget({ type: 'playground', index: deckIndex }, dragged => placeCard(dragged.target))
  const card = last(cardDeck?.cards)
  const boxShadow = isValid
    ? isOver
      ? '0 0 0 0.3rem #6ee7a0'
      : '0 0 0 0.2rem rgba(110, 231, 160, 0.7)'
    : isOver
      ? '0 0 0 0.3rem #f87171'
      : undefined

  return (
    <CardPlace size="large" dataTestId={`Playground-Deck-${deckIndex}`}>
      <DropSurface
        ref={setNodeRef}
        data-card-drop-target={dropId}
        data-drop-valid={isValid || undefined}
        data-drop-over={isOver || undefined}
        onClick={() => {
          if (activeTarget?.type === 'row' || activeTarget?.type === 'open-stack') {
            placeCard(activeTarget)
          }
        }}
        style={{ borderRadius: '0.375rem', boxShadow, transition: 'box-shadow 100ms' }}
      >
        {card ? <Card size="large" {...card} /> : null}
      </DropSurface>
    </CardPlace>
  )
}
