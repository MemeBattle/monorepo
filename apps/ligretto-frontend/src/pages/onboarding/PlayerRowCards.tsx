import { useCallback, type Ref, type RefObject } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { Card, CardPlace } from '#entities/card'
import { onboardingGameSelector, onboardingStepSelector, putFirstCardAction, putSecondCardAction, putThirdCardAction } from '#features/onboarding'

import { STEP_CONFIGS } from './stepConfig'

interface PlayerRowCardsProps {
  cardRefs: [RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>, RefObject<HTMLDivElement | null>]
  ref?: Ref<HTMLDivElement>
}

export const PlayerRowCards = ({ cardRefs, ref }: PlayerRowCardsProps) => {
  const dispatch = useDispatch()

  const game = useSelector(onboardingGameSelector)
  const step = useSelector(onboardingStepSelector)
  const config = STEP_CONFIGS[step]

  const current = game.players.id0

  const { isFirstRowCardActive, isSecondRowCardActive, isThirdRowCardActive } = config

  const handleFirstCardClick = useCallback(() => {
    if (isFirstRowCardActive) {
      dispatch(putFirstCardAction())
    }
  }, [dispatch, isFirstRowCardActive])

  const handleSecondCardClick = useCallback(() => {
    if (isSecondRowCardActive) {
      dispatch(putSecondCardAction())
    }
  }, [dispatch, isSecondRowCardActive])

  const handleThirdCardClick = useCallback(() => {
    if (isThirdRowCardActive) {
      dispatch(putThirdCardAction())
    }
  }, [dispatch, isThirdRowCardActive])

  return (
    <CardsRow ref={ref}>
      <CardPlace ref={cardRefs[0]} dataTestId="OnboardingPage-RowCard-0">
        <Card isDisabled={!isFirstRowCardActive} isHighlighted={isFirstRowCardActive} {...current.cards[0]} onClick={handleFirstCardClick} />
      </CardPlace>
      <CardPlace ref={cardRefs[1]} dataTestId="OnboardingPage-RowCard-1">
        <Card isDisabled={!isSecondRowCardActive} isHighlighted={isSecondRowCardActive} {...current.cards[1]} onClick={handleSecondCardClick} />
      </CardPlace>
      <CardPlace ref={cardRefs[2]} dataTestId="OnboardingPage-RowCard-2">
        <Card isDisabled={!isThirdRowCardActive} isHighlighted={isThirdRowCardActive} {...current.cards[2]} onClick={handleThirdCardClick} />
      </CardPlace>
    </CardsRow>
  )
}
