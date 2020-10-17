import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Player } from '@memebattle/ligretto-shared'
import { PositionOnTable, RenderChildren, RoomGrid } from '@memebattle/ligretto-ui'
import { PlayerReadyButton } from 'components/blocks/game/player-ready-button'
import { StartGameButton, OpponentWaiting } from 'components/blocks/game'
import { selectOpponents, togglePlayerStatusAction, startGameAction, selectPlayer } from 'ducks/game'

// eslint-disable-next-line react/display-name
const renderOpponent: (opponent: Player) => RenderChildren = ({ status }) => (positionOnTable: PositionOnTable) => (
  <OpponentWaiting key={positionOnTable} opponentStatus={status} positionOnTable={positionOnTable} />
)

export const GameLobby = () => {
  const dispatch = useDispatch()
  const opponents = useSelector(selectOpponents)
  const player = useSelector(selectPlayer)

  const handleReadyToPlayButtonClick = React.useCallback(() => {
    dispatch(togglePlayerStatusAction())
  }, [dispatch])

  const handleStartGameClick = React.useCallback(() => {
    dispatch(startGameAction())
  }, [dispatch])

  const renderChildren = React.useMemo(() => opponents.map<RenderChildren>(renderOpponent), [opponents])

  if (!player) {
    return <>Loading</>
  }

  return (
    <>
      <RoomGrid renderChildren={renderChildren} />
      <PlayerReadyButton onClick={handleReadyToPlayButtonClick} hideButton={player.isHost} />
      {player.isHost ? <StartGameButton onClick={handleStartGameClick} disabled={opponents.length === 0} /> : null}
    </>
  )
}
