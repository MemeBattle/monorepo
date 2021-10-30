import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  setSelectedCardIndexAction,
  selectPlayerStackOpenDeckCards,
  tapStackOpenDeckCardAction,
  tapStackDeckCardAction,
  selectPlayerStackDeckCards,
  selectIsDndEnabled,
  selectSelectedCardIndex,
  STACK_OPEN_DECK_INDEX,
} from 'ducks/game'
import { Stack } from 'components/blocks/game'
import { createSelector } from 'reselect'

const StackContainerSelector = createSelector(
  [selectPlayerStackOpenDeckCards, selectPlayerStackDeckCards, selectIsDndEnabled, selectSelectedCardIndex],
  (stackOpenDeckCards, stackDeckCards, isDndEnabled, selectedCardIndex) => ({
    stackOpenDeckCard: stackOpenDeckCards[stackOpenDeckCards.length - 1] ? stackOpenDeckCards[stackOpenDeckCards.length - 1] : {},
    stackDeckCards,
    isDndEnabled,
    selectedCardIndex,
  }),
)

export const StackContainer = () => {
  const dispatch = useDispatch()
  const { stackDeckCards, stackOpenDeckCard, isDndEnabled, selectedCardIndex } = useSelector(StackContainerSelector)

  const handleStackOpenDeckCardClick = useCallback(() => {
    if (isDndEnabled && stackOpenDeckCard?.value !== 1) {
      dispatch(setSelectedCardIndexAction(STACK_OPEN_DECK_INDEX))
    } else {
      dispatch(tapStackOpenDeckCardAction())
    }
  }, [dispatch, isDndEnabled, stackOpenDeckCard])

  const handleStackOpenDeckCardOutsideClick = useCallback(() => {
    dispatch(setSelectedCardIndexAction())
  }, [dispatch])

  const handleStackDeckCardClick = useCallback(() => {
    dispatch(tapStackDeckCardAction())
  }, [dispatch])

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
