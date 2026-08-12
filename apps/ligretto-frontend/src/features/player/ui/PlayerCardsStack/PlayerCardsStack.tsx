import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { CardsStack } from '#entities/card'
import { tapStackDeckCardAction, tapStackOpenDeckCardAction } from '#ducks/game'
import { useCardFocus } from '#features/cardFocus'
import { playerCardsStackSelector } from './PlayerCardsStack.selector'

export const PlayerCardsStack = () => {
  const dispatch = useDispatch()
  const { stackDeckCards, isStackDeckHidden, stackOpenDeckCard, isDndEnabled } = useSelector(playerCardsStackSelector)
  const { isFocused, isDimmed, toggleFocus, clearFocus } = useCardFocus({
    target: { type: 'stack-open' },
    identity: { color: stackOpenDeckCard?.color, value: stackOpenDeckCard?.value },
  })

  const handleStackOpenDeckCardClick = useCallback(() => {
    if (isDndEnabled && stackOpenDeckCard?.value !== 1) {
      toggleFocus()
    } else {
      clearFocus()
      dispatch(tapStackOpenDeckCardAction())
    }
  }, [clearFocus, dispatch, isDndEnabled, stackOpenDeckCard?.value, toggleFocus])

  const handleStackDeckCardClick = useCallback(() => {
    clearFocus()
    dispatch(tapStackDeckCardAction())
  }, [clearFocus, dispatch])

  if (!stackDeckCards) {
    return null
  }

  return (
    <CardsStack
      stackOpenDeckCard={stackOpenDeckCard}
      stackDeckCards={stackDeckCards}
      isStackDeckHidden={isStackDeckHidden}
      onStackOpenDeckCardClick={handleStackOpenDeckCardClick}
      onStackDeckCardClick={handleStackDeckCardClick}
      isDndEnabled={isDndEnabled}
      isStackOpenDeckSelected={isFocused}
      isStackOpenDeckDarkened={isDimmed}
      markCardsForFocus
    />
  )
}
