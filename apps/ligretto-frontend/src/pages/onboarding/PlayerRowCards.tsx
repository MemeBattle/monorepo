import { type Ref, type RefObject } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { Card as PlayerCard } from '@memebattle/ligretto-shared'
import type { ActionCreatorWithoutPayload } from '@reduxjs/toolkit'
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
import { useCardFocus } from '#features/cardFocus'

const ROW_CARD_EVENTS = [
  { event: OnboardingEvent.PutFirstCard, action: putFirstCardAction },
  { event: OnboardingEvent.PutSecondCard, action: putSecondCardAction },
  { event: OnboardingEvent.PutThirdCard, action: putThirdCardAction },
] as const

interface OnboardingRowCardProps {
  action: ActionCreatorWithoutPayload
  card: PlayerCard | null
  index: number
  isActive: boolean
}

const OnboardingRowCard = ({ action, card, index, isActive }: OnboardingRowCardProps) => {
  const dispatch = useDispatch()
  const { isFocused, isDimmed, toggleFocus } = useCardFocus({ type: 'row', index }, [card?.color, card?.value])

  const onCardActivate = () => {
    if (!isActive || !card) {
      return
    }
    if (card.value === 1) {
      dispatch(action())
      return
    }
    toggleFocus()
  }

  return (
    <Card
      {...card}
      data-card-focus-element
      data-card-focused={isFocused}
      isDarkened={isDimmed}
      isDisabled={!isActive}
      isHighlighted={isActive}
      isSelected={isFocused}
      onClick={isActive ? onCardActivate : undefined}
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
      {ROW_CARD_EVENTS.map(({ event, action }, index) => {
        const isActive = allowedEvents.includes(event)
        return (
          <CardPlace key={event} ref={cardRefs[index]} dataTestId={`OnboardingPage-RowCard-${index}`}>
            <OnboardingRowCard action={action} card={current.cards[index]} index={index} isActive={isActive} />
          </CardPlace>
        )
      })}
    </CardsRow>
  )
}
