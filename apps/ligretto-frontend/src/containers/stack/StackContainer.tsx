import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Stack } from 'components/blocks/game'
import { setSelectedCardIndexAction, STACK_OPEN_DECK_INDEX, tapStackDeckCardAction, tapStackOpenDeckCardAction } from 'ducks/game'
import { stackContainerSelector } from './StackContainer.selector'

export const StackContainer = () => {
  const dispatch = useDispatch()
  const { stackDeckCards, stackOpenDeckCard, isDndEnabled, selectedCardIndex } = useSelector(stackContainerSelector)

  const handleStackOpenDeckCardClick = useCallback(() => {
    if (isDndEnabled && stackOpenDeckCard?.value !== 1) {
      dispatch(setSelectedCardIndexAction(STACK_OPEN_DECK_INDEX))
    } else {
      dispatch(tapStackOpenDeckCardAction())
    }
  }, [dispatch, isDndEnabled, stackOpenDeckCard])

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
      isStackOpenDeckSelected={selectedCardIndex === STACK_OPEN_DECK_INDEX}
    />
  )
}
