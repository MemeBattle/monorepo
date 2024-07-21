import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { CardsRow } from '#entities/card/ui/CardsRow'

import { Card, CardPlace } from '#entities/card'
import { onboardingGameSelector, putFirstCardAction, putSecondCardAction, putThirdCardAction } from '#features/onboarding'

export const PlayerRowCards = () => {
  const dispatch = useDispatch()

  const game = useSelector(onboardingGameSelector)

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
        <Card {...current.cards[0]} onClick={handleFirstCardClick} />
      </CardPlace>
      <CardPlace>
        <Card {...current.cards[1]} onClick={handleSecondCardClick} />
      </CardPlace>
      <CardPlace>
        <Card {...current.cards[2]} onClick={handleThirdCardClick} />
      </CardPlace>
    </CardsRow>
  )
}
