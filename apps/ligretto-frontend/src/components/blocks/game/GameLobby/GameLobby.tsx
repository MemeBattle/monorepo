import type { FC } from 'react'
import React, { useMemo } from 'react'
import type { Player as SharedPlayer } from '@memebattle/ligretto-shared'
import { GameStatus } from '@memebattle/ligretto-shared'
import { RoomGrid } from 'components/blocks/game/RoomGrid'

import { GameSettingsContainer } from 'containers/GameSettings'
import { OpponentWaiting } from 'components/blocks/game'
import { Player as PlayerComponent } from 'components/blocks/game/Player'

import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

type Player = { status: SharedPlayer['status']; isHost: boolean; username: string; id: string; avatar?: string }

interface GameLobbyProps {
  opponents: Player[]
  player?: Player | null
  gameStatus: GameStatus
}

export const GameLobby: FC<GameLobbyProps> = ({ opponents, player, gameStatus }) => {
  const playerAvatarImg = useMemo(
    () => (player?.avatar ? buildCasStaticUrl(player.avatar) : getRandomAvatar(player?.id)),
    [player?.avatar, player?.id],
  )

  if (!player) {
    return <>Loading</>
  }

  return (
    <RoomGrid
      centerElement={gameStatus !== GameStatus.InGame ? <GameSettingsContainer /> : null}
      bottomElement={<PlayerComponent avatar={playerAvatarImg} username={player.username} status={player.status} />}
    >
      {opponents.map(({ id, status, username, avatar }) => (
        <OpponentWaiting id={id} avatar={avatar} username={username} key={id} opponentStatus={status} />
      ))}
    </RoomGrid>
  )
}
