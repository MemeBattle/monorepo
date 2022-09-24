import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Stack } from 'components/blocks/game'
import { setSelectedCardIndexAction, STACK_OPEN_DECK_INDEX, tapStackDeckCardAction, tapStackOpenDeckCardAction } from 'ducks/game'
import { stackContainerSelector } from './StackContainer.selector'

export const StackContainer = () => {
  const dispatch = useDispatch()
  const { stackDeckCards, stackOpenDeckCard, isDndEnabled, selectedCardIndex } = useSelector(stackContainerSelector)

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
    <Stack
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
