import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Player } from '@memebattle/ligretto-shared'
import { PositionOnTable, RenderChildren, RoomGrid } from 'components/base/room-grid'
import { OpponentWaiting } from 'components/blocks/game/opponent-waiting'
import { PlayerReadyButton } from 'components/blocks/game/player-ready-button'
import { selectOpponents, togglePlayerStatusAction } from 'ducks/game'

const renderOpponent: (opponent: Player) => RenderChildren = ({ status }) => (positionOnTable: PositionOnTable) => (
  <OpponentWaiting opponentStatus={status} positionOnTable={positionOnTable} />
)

export const GameLobby = () => {
  const dispatch = useDispatch()
  const opponents = useSelector(selectOpponents)
  const handleReadyToPlayButtonClick = React.useCallback(() => {
    dispatch(togglePlayerStatusAction())
  }, [dispatch])

  const renderChildren = React.useMemo(() => opponents.map<RenderChildren>(renderOpponent), [opponents])

  return (
    <>
      <RoomGrid renderChildren={renderChildren} />
      <PlayerReadyButton onClick={handleReadyToPlayButtonClick} />
    </>
  )
}
