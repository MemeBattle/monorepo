import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { Card, CardPlace } from '#entities/card'
import {
  OnboardingStep,
  onboardingGameSelector,
  onboardingStepSelector,
  putFirstCardAction,
  putSecondCardAction,
  putThirdCardAction,
} from '#features/onboarding'

const DISABLED_CARDS_STEPS = new Set<OnboardingStep>([
  OnboardingStep.Opponents,
  OnboardingStep.Playground,
  OnboardingStep.Cards,
  OnboardingStep.Stack,
  OnboardingStep.Row,
  OnboardingStep.Ligretto,
])

export const PlayerRowCards = () => {
  const dispatch = useDispatch()

  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)

  const areCardsDisabled = DISABLED_CARDS_STEPS.has(step)

  const current = game.players.id0

  const handleFirstCardClick = useCallback(() => {
    dispatch(putFirstCardAction())
  }, [dispatch])

  const handleSecondCardClick = useCallback(() => {
    dispatch(putSecondCardAction())
  }, [dispatch])

  const handleThirdCardClick = useCallback(() => {
    dispatch(putThirdCardAction())
  }, [dispatch])

  return (
    <CardsRow>
      <CardPlace>
        <Card isDisabled={areCardsDisabled} {...current.cards[0]} onClick={handleFirstCardClick} />
      </CardPlace>
      <CardPlace>
        <Card isDisabled={areCardsDisabled} {...current.cards[1]} onClick={handleSecondCardClick} />
      </CardPlace>
      <CardPlace>
        <Card isDisabled={areCardsDisabled} {...current.cards[2]} onClick={handleThirdCardClick} />
      </CardPlace>
    </CardsRow>
  )
}
