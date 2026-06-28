import { useCallback, type Ref, type RefObject } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { Card, CardPlace } from '#entities/card'
import { OnboardingStep, onboardingGameSelector, onboardingStepSelector, putFirstCardAction, putSecondCardAction } from '#features/onboarding'

const FIRST_CARD_ACTIVE_STEPS = new Set<OnboardingStep>([OnboardingStep.FirstCard])
const SECOND_CARD_ACTIVE_STEPS = new Set<OnboardingStep>([OnboardingStep.RowAvailableCard, OnboardingStep.GameStarted])
const SECOND_CARD_HIGHLIGHT_STEPS = new Set<OnboardingStep>([OnboardingStep.RowAvailableCard, OnboardingStep.GameStarted])

interface PlayerRowCardsProps {
  cardRefs: [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>]
  ref?: Ref<HTMLDivElement>
}

export const PlayerRowCards = ({ cardRefs, ref }: PlayerRowCardsProps) => {
  const dispatch = useDispatch()

  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)

  const current = game.players.id0

  const isFirstCardActive = FIRST_CARD_ACTIVE_STEPS.has(step)
  const isSecondCardActive = SECOND_CARD_ACTIVE_STEPS.has(step)

  const handleFirstCardClick = useCallback(() => {
    if (isFirstCardActive) {
      dispatch(putFirstCardAction())
    }
  }, [dispatch, isFirstCardActive])

  const handleSecondCardClick = useCallback(() => {
    if (isSecondCardActive) {
      dispatch(putSecondCardAction())
    }
  }, [dispatch, isSecondCardActive])

  return (
    <CardsRow ref={ref}>
      <CardPlace ref={cardRefs[0]}>
        <Card
          isDisabled={!isFirstCardActive}
          isHighlighted={step === OnboardingStep.FirstCard}
          {...current.cards[0]}
          onClick={handleFirstCardClick}
        />
      </CardPlace>
      <CardPlace ref={cardRefs[1]}>
        <Card
          isDisabled={!isSecondCardActive}
          isHighlighted={SECOND_CARD_HIGHLIGHT_STEPS.has(step)}
          {...current.cards[1]}
          onClick={handleSecondCardClick}
        />
      </CardPlace>
      <CardPlace ref={cardRefs[2]}>
        <Card isDisabled {...current.cards[2]} />
      </CardPlace>
    </CardsRow>
  )
}
