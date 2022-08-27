import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { isDndEnabledSelector, tapLigrettoDeckCardAction, playerLigrettoDeckCardsSelector } from 'ducks/game'
import { LigrettoPack } from 'components/blocks/game/ligretto-pack'

export const LigrettoDeckContainer = () => {
  const dispatch = useDispatch()
  const isDndEnabled = useSelector(isDndEnabledSelector)
  const ligrettoDeckCards = useSelector(playerLigrettoDeckCardsSelector)

  const onLigrettoDeckCardClick = useCallback(() => {
    dispatch(tapLigrettoDeckCardAction())
  }, [dispatch])

  if (!ligrettoDeckCards) {
    return null
  }

  return (
    <LigrettoPack
      count={ligrettoDeckCards.length}
      isDndEnabled={isDndEnabled}
      ligrettoDeckCards={ligrettoDeckCards}
      onLigrettoDeckCardClick={onLigrettoDeckCardClick}
    />
  )
}
