import { useCallback, type Ref, type RefObject } from 'react'
import last from 'lodash/last'
import type { CardsDeck } from '@memebattle/ligretto-shared'

import { Card, CardPlace } from '#entities/card'
import { useCardInteraction, useDroppableTarget, type CardDragTarget } from '#features/cardInteraction'
import { TableCards } from '#features/playground/ui/TableCards'
import type { OnboardingGame } from '#features/onboarding'
import { canPlaceOnboardingCard, type OnboardingPlacement } from './onboardingPlacement'

interface OnboardingPlaygroundDeckProps {
  deck: CardsDeck | null | undefined
  index: number
  isHighlighted: boolean
  onPlace: (source: CardDragTarget, playgroundDeckIndex: number) => void
  deckRef?: RefObject<HTMLDivElement | null>
}

const OnboardingPlaygroundDeck = ({ deck, index, isHighlighted, onPlace, deckRef }: OnboardingPlaygroundDeckProps) => {
  const { activeTarget } = useCardInteraction()
  const place = useCallback((source: CardDragTarget) => onPlace(source, index), [index, onPlace])
  const { id, onClick, setNodeRef } = useDroppableTarget({ type: 'playground', index }, place)
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node)
      if (deckRef) {
        deckRef.current = node
      }
    },
    [deckRef, setNodeRef],
  )
  const card = last(deck?.cards)

  return (
    <CardPlace
      ref={ref}
      size="large"
      dataTestId={`Playground-Deck-${index}`}
      data-card-drop-target={id}
      data-card-interaction-element
      data-drop-valid={isHighlighted || undefined}
      isHighlighted={isHighlighted}
      // A place is only a target while there is a picked card to put on it.
      onClick={activeTarget ? onClick : undefined}
    >
      {card ? <Card size="large" {...card} /> : null}
    </CardPlace>
  )
}

interface OnboardingPlaygroundProps {
  game: OnboardingGame
  /** The move the current step expects, if any — the onboarding points at every deck its card can go to. */
  placement?: OnboardingPlacement
  onPlace: (source: CardDragTarget, playgroundDeckIndex: number) => void
  ref?: Ref<HTMLDivElement>
  deckRefs?: Array<RefObject<HTMLDivElement | null> | undefined>
}

export const OnboardingPlayground = ({ game, placement, onPlace, ref, deckRefs }: OnboardingPlaygroundProps) => {
  const { activeTarget } = useCardInteraction()

  return (
    <TableCards ref={ref}>
      {Array.from({ length: 12 }, (_, index) => (
        <OnboardingPlaygroundDeck
          key={index}
          deck={game.playground.decks[index]}
          index={index}
          isHighlighted={canPlaceOnboardingCard(placement, game, activeTarget, index)}
          onPlace={onPlace}
          deckRef={deckRefs?.[index]}
        />
      ))}
    </TableCards>
  )
}
