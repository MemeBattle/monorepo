import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Hotkey, tapLigrettoDeckCardAction, playerLigrettoDeckCardsSelector, playerLigrettoDeckHiddenSelector } from '#ducks/game'
import { useCardHotkey, useCardInteraction } from '#features/cardInteraction'
import { LigrettoPack } from './LigrettoPack'

export const LigrettoDeckContainer = () => {
  const dispatch = useDispatch()
  const ligrettoDeckCards = useSelector(playerLigrettoDeckCardsSelector)
  const isDeckHidden = useSelector(playerLigrettoDeckHiddenSelector)
  const { clearActiveTarget } = useCardInteraction()

  const onLigrettoDeckCardClick = useCallback(() => {
    clearActiveTarget()
    dispatch(tapLigrettoDeckCardAction())
  }, [clearActiveTarget, dispatch])

  useCardHotkey(Hotkey.l, onLigrettoDeckCardClick)

  if (!ligrettoDeckCards) {
    return null
  }

  return (
    <LigrettoPack
      dataTestId="LigrettoDeck"
      count={ligrettoDeckCards.length}
      hotkey={Hotkey.l}
      ligrettoDeckCards={ligrettoDeckCards}
      isDeckHidden={isDeckHidden ?? true}
      onLigrettoDeckCardClick={onLigrettoDeckCardClick}
    />
  )
}
