import { type Ref, type RefObject } from 'react'
import { useSelector } from 'react-redux'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { Card, CardPlace } from '#entities/card'
import { OnboardingEvent, onboardingAllowedEventsSelector, onboardingGameSelector } from '#features/onboarding'
import { useCardInteraction, useDraggableCard } from '#features/cardInteraction'

const ROW_CARD_EVENTS = [OnboardingEvent.PutFirstCard, OnboardingEvent.PutSecondCard, OnboardingEvent.PutThirdCard] as const

/** A row card the step lets the player move: picked by a press or dragged, like in the game. */
const PlayableRowCard = ({ card, index }: { card: PlayerCard; index: number }) => {
  const { id, isActive, isDimmed, isDragging, listeners, setNodeRef, toggleActiveTarget } = useDraggableCard({ type: 'row', index }, card)

  return (
    <Card
      {...card}
      {...listeners}
      ref={setNodeRef}
      data-card-drag-source
      data-card-drag-id={id}
      data-card-interaction-element
      data-card-active={isActive}
      isDarkened={isDimmed}
      isHighlighted
      isSelected={isActive}
      isInvisible={isDragging}
      onClick={toggleActiveTarget}
    />
  )
}

/** A row card the step does not let the player move. Its unmount drops the selection once the step moves on. */
const IdleRowCard = ({ card, index }: { card: PlayerCard | null; index: number }) => {
  const { isDimmed } = useCardInteraction({ type: 'row', index })

  return <Card {...card} data-card-interaction-element isDarkened={isDimmed} isDisabled />
}

interface PlayerRowCardsProps {
  cardRefs: [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>]
  ref?: Ref<HTMLDivElement>
}

export const PlayerRowCards = ({ cardRefs, ref }: PlayerRowCardsProps) => {
  const game = useSelector(onboardingGameSelector)
  const allowedEvents = useSelector(onboardingAllowedEventsSelector)
  const current = game.players.id0

  return (
    <CardsRow ref={ref}>
      {ROW_CARD_EVENTS.map((event, index) => {
        const card = current.cards[index]
        return (
          <CardPlace key={event} ref={cardRefs[index]} dataTestId={`OnboardingPage-RowCard-${index}`}>
            {card && allowedEvents.includes(event) ? <PlayableRowCard card={card} index={index} /> : <IdleRowCard card={card} index={index} />}
          </CardPlace>
        )
      })}
    </CardsRow>
  )
}
