import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Player } from '@memebattle/ligretto-shared'
import { isMultiplyRenderChildren, PositionOnTable, RenderChildren, RoomGrid } from 'components/base/room-grid'
import { OpponentWaiting } from 'components/blocks/game/opponent-waiting'
import { PlayerReadyButton } from 'components/blocks/game/player-ready-button'
import { selectOpponents, togglePlayerStatusAction } from 'ducks/game'

const renderOpponent: (opponent: Player) => RenderChildren = ({ status }) => (positionOnTable: PositionOnTable) => (
  <OpponentWaiting opponentStatus={status} positionOnTable={positionOnTable} />
)

const createRenderChildren = (opponents: Player[]) => {
  const renderChild = opponents.map<RenderChildren>(renderOpponent)
  if (isMultiplyRenderChildren(renderChild)) {
    return renderChild
  } else {
    throw Error('Opponents are not valid')
  }
}

export const GameLobby = () => {
  const dispatch = useDispatch()
  const opponents = useSelector(selectOpponents)
  const handleReadyToPlayButtonClick = React.useCallback(() => {
    dispatch(togglePlayerStatusAction())
  }, [dispatch])

  const renderChildren = React.useMemo(() => createRenderChildren(opponents), [opponents])

  return (
    <>
      <RoomGrid renderChildren={renderChildren} />
      <PlayerReadyButton onClick={handleReadyToPlayButtonClick} />
    </>
  )
}
