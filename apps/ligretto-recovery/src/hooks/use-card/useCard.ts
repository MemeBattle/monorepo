import { CardPositions, Card } from '@memebattle/ligretto-shared'
import { useSelector, useDispatch } from 'react-redux'
import { cardsSelectors, cardsActions } from 'ducks/cards'
import * as Store from 'types/store'

export type UseCard = (
  cardPosition: CardPositions,
) => {
  onClick: () => void
} & Card

export const useCard: UseCard = cardPosition => {
  const card = useSelector<Store.All, Card>(state => cardsSelectors.selectCardByPosition(state, cardPosition))
  const dispatch = useDispatch()

  return { ...card, onClick: () => dispatch(cardsActions.tapCardAction({ cardPosition })) }
}
