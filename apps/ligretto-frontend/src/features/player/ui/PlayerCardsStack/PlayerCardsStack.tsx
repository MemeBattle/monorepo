import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { CardsStack } from 'entities/card'
import { setSelectedCardIndexAction, STACK_OPEN_DECK_INDEX, tapStackDeckCardAction, tapStackOpenDeckCardAction } from 'ducks/game'
import { playerCardsStackSelector } from './PlayerCardsStack.selector'

export const PlayerCardsStack = () => {
  const dispatch = useDispatch()
  const { stackDeckCards, stackOpenDeckCard, isDndEnabled, selectedCardIndex } = useSelector(playerCardsStackSelector)

  const handleStackOpenDeckCardClick = useCallback(() => {
    dispatch(tapStackOpenDeckCardAction())
  }, [dispatch])

  const handleStackOpenDeckCardOutsideClick = useCallback(() => {
    dispatch(setSelectedCardIndexAction(undefined))
  }, [dispatch])

  const handleStackDeckCardClick = useCallback(() => {
    dispatch(tapStackDeckCardAction())
  }, [dispatch])

  if (!stackDeckCards) {
    return null
  }

  return (
    <CardsStack
      stackOpenDeckCard={stackOpenDeckCard}
      stackDeckCards={stackDeckCards}
      onStackOpenDeckCardClick={handleStackOpenDeckCardClick}
      onStackDeckCardOutsideClick={handleStackOpenDeckCardOutsideClick}
      onStackDeckCardClick={handleStackDeckCardClick}
      isDndEnabled={isDndEnabled}
      isStackOpenDeckSelected={selectedCardIndex === STACK_OPEN_DECK_INDEX}
      isStackOpenDeckDarkened={typeof selectedCardIndex !== 'undefined' && selectedCardIndex !== STACK_OPEN_DECK_INDEX}
    />
  )
}
