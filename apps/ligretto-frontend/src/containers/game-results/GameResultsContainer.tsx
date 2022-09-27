import React, { useCallback } from 'react'

import { togglePlayerStatusAction } from 'ducks/game'
import { GameResults } from 'components/blocks/game/GameResults'
import { useDispatch } from 'react-redux'
import { useHistory } from 'react-router'
import { routes } from 'utils/constants'

export const GameResultsContainer = () => {
  const dispatch = useDispatch()
  const history = useHistory()

  const handleReadyClick = useCallback(() => {
    dispatch(togglePlayerStatusAction())
  }, [dispatch])

  const handleExitClick = useCallback(() => {
    history.push(routes.HOME)
  }, [history])

  return <GameResults onReadyClick={handleReadyClick} onExitClick={handleExitClick} />
}
