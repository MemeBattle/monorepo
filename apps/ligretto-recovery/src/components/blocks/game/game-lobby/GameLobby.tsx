import type { FC } from 'react'
import React from 'react'
import type { Player } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import { RoomGrid } from '@memebattle/ligretto-ui'
import { PlayerReadyButton } from 'components/blocks/game/player-ready-button'
import { OpponentWaiting } from 'components/blocks/game'
import { GameResults } from 'containers/game-results'

import styles from './GameLobby.module.scss'

interface GameLobbyProps {
  opponents: Player[]
  player: Player | undefined
  handleStartGameClick: () => void
  handleReadyToPlayButtonClick: () => void
  gameStatus: GameStatus
}

export const GameLobby: FC<GameLobbyProps> = ({ opponents, player, gameStatus, handleReadyToPlayButtonClick, handleStartGameClick }) => {
  if (!player) {
    return <>Loading</>
  }

  return (
    <>
      <RoomGrid>
        {opponents.map(({ id, status }) => (
          <OpponentWaiting key={id} opponentStatus={status} />
        ))}
      </RoomGrid>
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
