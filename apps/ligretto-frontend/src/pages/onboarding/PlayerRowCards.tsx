import { type Ref, type RefObject } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { Card, CardPlace } from '#entities/card'
import {
  OnboardingEvent,
  onboardingAllowedEventsSelector,
  onboardingGameSelector,
  putFirstCardAction,
  putSecondCardAction,
  putThirdCardAction,
} from '#features/onboarding'

const ROW_CARD_EVENTS = [
  { event: OnboardingEvent.PutFirstCard, action: putFirstCardAction },
  { event: OnboardingEvent.PutSecondCard, action: putSecondCardAction },
  { event: OnboardingEvent.PutThirdCard, action: putThirdCardAction },
] as const

interface PlayerRowCardsProps {
  cardRefs: [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>]
  ref?: Ref<HTMLDivElement>
}

export const PlayerRowCards = ({ cardRefs, ref }: PlayerRowCardsProps) => {
  const dispatch = useDispatch()

  const game = useSelector(onboardingGameSelector)
  const allowedEvents = useSelector(onboardingAllowedEventsSelector)

  const current = game.players.id0

  return (
    <CardsRow ref={ref}>
      {ROW_CARD_EVENTS.map(({ event, action }, index) => {
        const isActive = allowedEvents.includes(event)
        return (
          <CardPlace key={event} ref={cardRefs[index]} dataTestId={`OnboardingPage-RowCard-${index}`}>
            <Card
              isDisabled={!isActive}
              isHighlighted={isActive}
              {...current.cards[index]}
              onClick={isActive ? () => dispatch(action()) : undefined}
            />
          </CardPlace>
        )
      })}
    </CardsRow>
  )
}
