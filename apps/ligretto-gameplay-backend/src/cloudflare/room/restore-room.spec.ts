import { describe, expect, it } from 'vitest'
import { GameStatus, PlayerStatus } from '@memebattle/ligretto-shared'
import { restoreRoom } from './restore-room'

describe('restoreRoom', () => {
  it('rebuilds players from the Lobby and the sockets that are still open', () => {
    const restored = restoreRoom({ id: 'game', name: 'Room', playerIds: ['host', 'away'], connectedUserIds: ['host', 'watcher'], hasRounds: false })

    expect(restored).toMatchObject({ id: 'game', name: 'Room', status: GameStatus.New })
    expect(restored.players.host).toMatchObject({ isHost: true, status: PlayerStatus.DontReadyToPlay, cards: [] })
    expect(restored.players.away).toMatchObject({ isHost: false, status: PlayerStatus.Disconnected })
    expect(restored.spectators).toEqual({ watcher: { id: 'watcher' } })
  })

  it('gives the host role to the first player online, by the order they joined', () => {
    const restored = restoreRoom({
      id: 'game',
      name: 'Room',
      playerIds: ['away', 'peer', 'other'],
      connectedUserIds: ['other', 'peer'],
      hasRounds: false,
    })

    expect(restored.players.peer?.isHost).toBe(true)
    expect(restored.players.away?.isHost).toBe(false)
    expect(restored.players.other?.isHost).toBe(false)
  })

  it('keeps a host when nobody is online', () => {
    const restored = restoreRoom({ id: 'game', name: 'Room', playerIds: ['away', 'peer'], connectedUserIds: [], hasRounds: false })

    expect(restored.players.away?.isHost).toBe(true)
  })

  it('comes back between rounds as after one when the game has rounds', () => {
    const restored = restoreRoom({ id: 'game', name: 'Room', playerIds: ['host'], connectedUserIds: ['host'], hasRounds: true })

    expect(restored.status).toBe(GameStatus.RoundFinished)
  })
})
