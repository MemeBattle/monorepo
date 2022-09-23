import type { FC } from 'react'
import React, { useMemo } from 'react'
import type { Player as SharedPlayer } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import { RoomGrid } from 'components/blocks/game/RoomGrid'

import { GameResultsContainer } from 'containers/game-results'
import { OpponentWaiting } from 'components/blocks/game'
import { PlayerReadyButton } from 'components/blocks/game/player-ready-button'

import styles from './GameLobby.module.scss'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

type Player = { status: SharedPlayer['status']; isHost: boolean; username: string; id: string; avatar?: string }

interface GameLobbyProps {
  opponents: Player[]
  player?: Player | null
  handleStartGameClick: () => void
  handleReadyToPlayButtonClick: () => void
  gameStatus: GameStatus
}

export const GameLobby: FC<GameLobbyProps> = ({ opponents, player, gameStatus, handleReadyToPlayButtonClick, handleStartGameClick }) => {
  const playerAvatarImg = useMemo(
    () => (player?.avatar ? buildCasStaticUrl(player.avatar) : getRandomAvatar(player?.id)),
    [player?.avatar, player?.id],
  )

  if (!player) {
    return <>Loading</>
  }

  return (
    <>
      <RoomGrid
        centerElement={
          gameStatus === GameStatus.RoundFinished ? (
            <div className={styles.resultsTableWrapper}>
              <div className={styles.resultsTable}>
                <GameResultsContainer />
              </div>
            </div>
          ) : undefined
        }
        bottomElement={
          <PlayerReadyButton
            className={styles.playerReadyButton}
            onClick={player.isHost ? handleStartGameClick : handleReadyToPlayButtonClick}
            hideButton={opponents.length === 0}
            avatar={playerAvatarImg}
            username={player.username}
            status={player.status}
          />
        }
      >
        {opponents.map(({ id, status, username, avatar }) => (
          <OpponentWaiting id={id} avatar={avatar} username={username} key={id} opponentStatus={status} />
        ))}
      </RoomGrid>
    </>
  )
}
