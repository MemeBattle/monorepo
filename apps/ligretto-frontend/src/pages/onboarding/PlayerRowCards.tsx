import { type Ref, type RefObject } from 'react'
import { useSelector } from 'react-redux'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { Card, CardPlace } from '#entities/card'
import { OnboardingEvent, onboardingAllowedEventsSelector, onboardingGameSelector } from '#features/onboarding'
import { useCardInteraction } from '#features/cardInteraction'

const ROW_CARD_EVENTS = [OnboardingEvent.PutFirstCard, OnboardingEvent.PutSecondCard, OnboardingEvent.PutThirdCard] as const

interface OnboardingRowCardProps {
  card: PlayerCard | null
  index: number
  isEnabled: boolean
}

const OnboardingRowCard = ({ card, index, isEnabled }: OnboardingRowCardProps) => {
  const { isActive, isDimmed, toggleActiveTarget } = useCardInteraction({ type: 'row', index }, [card?.color, card?.value, isEnabled])
  const onCardActivate = isEnabled && card ? toggleActiveTarget : undefined

  return (
    <Card
      {...card}
      data-card-interaction-element
      data-card-active={isActive}
      isDarkened={isDimmed}
      isDisabled={!isEnabled}
      isHighlighted={isEnabled}
      isSelected={isActive}
      onClick={onCardActivate}
    />
  )
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
      {ROW_CARD_EVENTS.map((event, index) => (
        <CardPlace key={event} ref={cardRefs[index]} dataTestId={`OnboardingPage-RowCard-${index}`}>
          <OnboardingRowCard card={current.cards[index]} index={index} isEnabled={allowedEvents.includes(event)} />
        </CardPlace>
      ))}
    </CardsRow>
  )
}
