import CachedIcon from '@mui/icons-material/Cached'
import last from 'lodash/last'
import { styled } from '@mui/material/styles'
import { useCallback } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import { Hotkey, playerStackDeckCardsSelector, playerStackOpenDeckCardsSelector, tapStackDeckCardAction } from '#ducks/game'
import { Card, CardHotkeyBadge, CardPlace, CardViewTransition } from '#entities/card'
import { useCardHotkey, useCardInteraction } from '#features/cardInteraction'
import { useStackTurn } from './StackTurnContext'

const ReshuffleHint = styled('div')(({ theme }) => ({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'white',
  pointerEvents: 'none',
  fontSize: '3rem',
  [theme.breakpoints.down('sm')]: {
    fontSize: '2rem',
  },
}))

const LeavingCardLayer = styled('div')({
  position: 'absolute',
  top: 0,
  left: 0,
})

export const PlayerStackDeck = () => {
  const dispatch = useDispatch()
  const stackDeckCards = useSelector(playerStackDeckCardsSelector)
  const stackOpenDeckCards = useSelector(playerStackOpenDeckCardsSelector)
  const { clearActiveTarget } = useCardInteraction()
  const turn = useStackTurn()
  // Turning the stack is a command, not a selection: it drops whatever card was picked.
  const onStackDeckActivate = useCallback(() => {
    clearActiveTarget()
    dispatch(tapStackDeckCardAction())
  }, [clearActiveTarget, dispatch])
  useCardHotkey(Hotkey.space, onStackDeckActivate)

  if (!stackDeckCards) {
    return null
  }

  const top = turn && !turn.isArriving ? turn.arriving : last(stackDeckCards)
  const hasCards = top !== undefined

  return (
    <CardPlace>
      <CardHotkeyBadge hotkey={Hotkey.space}>
        {/* The server turns over the stack from its end: its last card becomes the top of the open stack. */}
        <CardViewTransition key={top?.id} name={top?.id} isFaceDown={hasCards}>
          <Card isHidden={hasCards} onClick={onStackDeckActivate} />
        </CardViewTransition>
      </CardHotkeyBadge>
      {turn ? (
        // Only seen while the old top of the open stack lands on the stack: it takes no focus and is not read out.
        <LeavingCardLayer inert>
          <CardViewTransition key={turn.leaving.id} name={turn.leaving.id} isTurningDown onTurnedDown={turn.finish}>
            <Card {...turn.leaving} />
          </CardViewTransition>
        </LeavingCardLayer>
      ) : null}
      {/* An empty stack next to a non-empty open deck is turned over rather than drawn from. */}
      {!hasCards && stackOpenDeckCards?.length ? (
        <ReshuffleHint>
          <CachedIcon fontSize="inherit" />
        </ReshuffleHint>
      ) : null}
    </CardPlace>
  )
}
