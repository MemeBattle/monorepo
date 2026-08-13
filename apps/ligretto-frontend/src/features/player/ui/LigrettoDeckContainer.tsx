import React, { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  Hotkey,
  isDndEnabledSelector,
  tapLigrettoDeckCardAction,
  playerLigrettoDeckCardsSelector,
  playerLigrettoDeckHiddenSelector,
} from '#ducks/game'
import { LigrettoPack } from './LigrettoPack'
import { useCardHotkey } from '../lib/useCardHotkey'

export const LigrettoDeckContainer = () => {
  const dispatch = useDispatch()
  const isDndEnabled = useSelector(isDndEnabledSelector)
  const ligrettoDeckCards = useSelector(playerLigrettoDeckCardsSelector)
  const isDeckHidden = useSelector(playerLigrettoDeckHiddenSelector)
  const isLigrettoDeckEnabled = isDndEnabled && !!ligrettoDeckCards?.length

  const onLigrettoDeckCardClick = useCallback(() => {
    dispatch(tapLigrettoDeckCardAction())
  }, [dispatch])

  useCardHotkey(Hotkey.l, onLigrettoDeckCardClick, isLigrettoDeckEnabled)

  if (!ligrettoDeckCards) {
    return null
  }

  return (
    <LigrettoPack
      count={ligrettoDeckCards.length}
      isDndEnabled={isLigrettoDeckEnabled}
      ligrettoDeckCards={ligrettoDeckCards}
      isDeckHidden={isDeckHidden ?? true}
      onLigrettoDeckCardClick={onLigrettoDeckCardClick}
    />
  )
}
