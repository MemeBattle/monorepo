import type { FC } from 'react'
import React from 'react'
import type { Player } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import type { PositionOnTable, RenderChildren } from '@memebattle/ligretto-ui'
import { RoomGrid } from '@memebattle/ligretto-ui'
import { PlayerReadyButton } from 'components/blocks/game/player-ready-button'
import { OpponentWaiting } from 'components/blocks/game'
import { GameResults } from 'containers/game-results'

import styles from './GameLobby.module.scss'

// eslint-disable-next-line react/display-name
const renderOpponent: (opponent: Player) => RenderChildren = ({ status }) => (positionOnTable: PositionOnTable) => (
  <OpponentWaiting key={positionOnTable} opponentStatus={status} positionOnTable={positionOnTable} />
)

interface GameLobbyProps {
  opponents: Player[]
  player: Player | undefined
  handleStartGameClick: () => void
  handleReadyToPlayButtonClick: () => void
  gameStatus: GameStatus
}

export const GameLobby: FC<GameLobbyProps> = ({ opponents, player, gameStatus, handleReadyToPlayButtonClick, handleStartGameClick }) => {
  const renderChildren = React.useMemo(() => opponents.map<RenderChildren>(renderOpponent), [opponents])

  if (!player) {
    return <>Loading</>
  }

  return (
    <>
      <RoomGrid renderChildren={renderChildren} />
      {gameStatus === GameStatus.RoundFinished ? (
        <div className={styles.resultsTableWrapper}>
          <div className={styles.resultsTable}>
            <GameResults />
          </div>
        </div>
      ) : null}
      <PlayerReadyButton
        className={styles.playerReadyButton}
        onClick={player.isHost ? handleStartGameClick : handleReadyToPlayButtonClick}
        hideButton={opponents.length === 0}
      />
    </>
  )
}
