import { describe, expect, it } from 'vitest'
import type { Game } from '@memebattle/ligretto-shared'
import { Room } from '../../core/game/room'
import { addPlayer, addSpectator, createGame, leaveRoom } from '../../core/game/model/room'
import { lobbyRecordOf } from './lobby-view'

describe('lobbyRecordOf', () => {
  const recordOf = (state: Game) => lobbyRecordOf(new Room(state, { broadcast: () => {} }))
  const withHost = addPlayer(createGame('game', 'Room'), 'host')

  it('ignores a spectator', () => {
    expect(recordOf(addSpectator(withHost, 'watcher'))).toBe(recordOf(withHost))
  })

  it('sees a new player', () => {
    expect(recordOf(addPlayer(withHost, 'peer'))).not.toBe(recordOf(withHost))
  })

  it('sees a player replaced by another at the same count', () => {
    const before = addPlayer(withHost, 'peer')

    expect(recordOf(addPlayer(leaveRoom(before, 'peer'), 'other'))).not.toBe(recordOf(before))
  })
})
