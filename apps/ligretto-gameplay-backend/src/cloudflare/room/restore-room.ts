import type { Game, UUID } from '@memebattle/ligretto-shared'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'
import { createGame, createPlayer, onlinePlayersOf, playersOf, withHost } from '../../core/game/model/room'

/**
 * Nothing but the Lobby's room, the sockets that outlived the object and whether ligretto-core has rounds of it: a room
 * that comes back starts over with the same people, between rounds as after one.
 */
export const restoreRoom = ({
  id,
  name,
  playerIds,
  connectedUserIds,
  hasRounds,
}: {
  id: UUID
  name: string
  playerIds: UUID[]
  connectedUserIds: UUID[]
  hasRounds: boolean
}): Game => {
  const game: Game = {
    ...createGame(id, name),
    status: hasRounds ? GameStatus.RoundFinished : GameStatus.New,
    players: Object.fromEntries(
      playerIds.map(playerId => [
        playerId,
        createPlayer(playerId, { status: connectedUserIds.includes(playerId) ? PlayerStatus.DontReadyToPlay : PlayerStatus.Disconnected }),
      ]),
    ),
    spectators: Object.fromEntries(connectedUserIds.filter(userId => !playerIds.includes(userId)).map(userId => [userId, { id: userId }])),
  }
  return withHost(game, (onlinePlayersOf(game)[0] ?? playersOf(game)[0])?.id)
}
