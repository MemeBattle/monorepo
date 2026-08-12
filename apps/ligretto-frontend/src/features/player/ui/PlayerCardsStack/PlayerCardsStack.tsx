import React from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Card, CardsStack } from '#entities/card'
import { tapStackDeckCardAction, tapStackOpenDeckCardAction } from '#ducks/game'
import { FocusableCard } from '#features/cardFocus'
import { playerCardsStackSelector } from './PlayerCardsStack.selector'

export const PlayerCardsStack = () => {
  const dispatch = useDispatch()
  const { stackDeckCards, isStackDeckHidden, stackOpenDeckCard, isDndEnabled } = useSelector(playerCardsStackSelector)

  if (!stackDeckCards) {
    return null
  }

  return (
    <CardsStack
      stackOpenDeckCard={stackOpenDeckCard}
      stackDeckCards={stackDeckCards}
      isStackDeckHidden={isStackDeckHidden}
      onStackOpenDeckCardClick={() => dispatch(tapStackOpenDeckCardAction())}
      onStackDeckCardClick={() => dispatch(tapStackDeckCardAction())}
      isDndEnabled={isDndEnabled}
      isStackOpenDeckSelected={false}
      isStackOpenDeckDarkened={false}
      openCard={
        stackOpenDeckCard && (
          <FocusableCard target={{ type: 'stack-open' }} deps={[stackOpenDeckCard.color, stackOpenDeckCard.value]}>
            {({ isFocused, isDimmed, toggleFocus, clearFocus }) => (
              <Card
                {...stackOpenDeckCard}
                isSelected={isFocused}
                isDarkened={isDimmed}
                onClick={() => {
                  if (isDndEnabled && stackOpenDeckCard.value !== 1) {
                    toggleFocus()
                  } else {
                    clearFocus()
                    dispatch(tapStackOpenDeckCardAction())
                  }
                }}
              />
            )}
          </FocusableCard>
        )
      }
    />
  )
}
