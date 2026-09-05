import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Hotkey, tapLigrettoDeckCardAction, playerLigrettoDeckCardsSelector, playerLigrettoDeckHiddenSelector } from '#ducks/game'
import { useCardHotkey, useCardAction, useCardInputEnabled } from '#features/cardInteraction'
import { LigrettoPack } from './LigrettoPack'

export const LigrettoDeckContainer = () => {
  const dispatch = useDispatch()
  const ligrettoDeckCards = useSelector(playerLigrettoDeckCardsSelector)
  const isDeckHidden = useSelector(playerLigrettoDeckHiddenSelector)
  const isLigrettoDeckEnabled = useCardInputEnabled() && !!ligrettoDeckCards?.length

  const onLigrettoDeckCardClick = useCallback(() => {
    if (isLigrettoDeckEnabled) {
      dispatch(tapLigrettoDeckCardAction())
    }
  }, [dispatch, isLigrettoDeckEnabled])

  const activate = useCardAction(onLigrettoDeckCardClick, isLigrettoDeckEnabled)
  useCardHotkey(isLigrettoDeckEnabled ? Hotkey.l : undefined, onLigrettoDeckCardClick)

  if (!ligrettoDeckCards) {
    return null
  }

  return (
    <LigrettoPack
      dataTestId="LigrettoDeck"
      count={ligrettoDeckCards.length}
      hotkey={isLigrettoDeckEnabled ? Hotkey.l : undefined}
      ligrettoDeckCards={ligrettoDeckCards}
      isDeckHidden={isDeckHidden ?? true}
      onLigrettoDeckCardClick={activate}
    />
  )
}
