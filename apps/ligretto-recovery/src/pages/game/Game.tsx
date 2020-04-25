//TODO: Divide on separate components
import React from 'react'
import { GameCoverScreen } from 'components/screens/game-cover-screen/GameCoverScreen'
import { CardsPanel } from 'components/blocks/game/cards-panel'
import { OpponentCards } from 'components/blocks/game/opponent-cards'
import { OpponentWaiting } from 'components/blocks/game/opponent-waiting'
import { isMultiplyRenderChildren, PositionOnTable, RenderChildren, RenderMultiplyChildren, RoomGrid } from 'components/base/room-grid'
import { TableCards } from 'components/blocks/game/table-cards'
import { PlayerReadyButton } from 'components/blocks/game/player-ready-button'
import styles from './Game.module.scss'
import { OpponentStatus } from '../../components/blocks/game/opponent-waiting/OpponentWaiting'

const opponents = [0, 1, 2]

const renderOpponent: RenderChildren = (positionOnTable: PositionOnTable) => <OpponentCards positionOnTable={positionOnTable} />
const renderOpponentWaiting: RenderChildren = (positionOnTable: PositionOnTable) => (
  <OpponentWaiting opponentStatus={OpponentStatus.Waiting} positionOnTable={positionOnTable} />
)

export const GamePage: React.FC = () => {
  const [isGameStarted, setGameStarted] = React.useState(false)

  const renderChildren: RenderMultiplyChildren = React.useMemo(() => {
    const renderChild = opponents.map<RenderChildren>(() => (isGameStarted ? renderOpponent : renderOpponentWaiting))
    if (isMultiplyRenderChildren(renderChild)) {
      return renderChild
    } else {
      throw Error('Opponents are not valid')
    }
  }, [isGameStarted])

  return (
    <GameCoverScreen>
      <RoomGrid renderChildren={renderChildren} />
      {isGameStarted ? <TableCards /> : null}
      {isGameStarted ? <CardsPanel /> : <PlayerReadyButton className={styles.playerReadyButton} onClick={() => setGameStarted(true)} />}
    </GameCoverScreen>
  )
}
